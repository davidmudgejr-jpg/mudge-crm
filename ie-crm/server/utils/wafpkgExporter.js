/**
 * wafpkgExporter.js
 *
 * Generates AIR CRE-compatible WAFPKG files from contract data.
 * Takes field values + template XAML, injects values into the XAML,
 * wraps in WinAirFile XML envelope, and optionally encrypts.
 *
 * The encryption matches the original AIR CRE desktop app exactly:
 *   1. Derive password: AES-128 encrypt "W1n41r-f0rMs-3.0" with CONST_01/CONST_02
 *   2. Concat encrypted bytes as decimal string → derived password
 *   3. Use Rfc2898DeriveBytes(derivedPassword, CONST_03) for key/IV
 *   4. GZip compress → AES-128-CBC encrypt
 */

const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Encryption constants (from decompiled Airea.Waf.Encrypter.dll)
const PASS = 'W1n41r-f0rMs-3.0';
const CONST_01 = Buffer.from([101,185,10,248,197,128,245,61,179,37,219,53,108,241,176,85]);
const CONST_02 = Buffer.from([179,167,112,185,225,239,178,81,143,236,168,63,67,219,228,68]);
const CONST_03 = Buffer.from([31,16,98,186,185,183,2,172,91,112,99,201,120,133,123,71]);

const PARSED_DIR = path.join(__dirname, '..', '..', 'air-cre-data', 'parsed');

/**
 * Derive the password the same way WAFEncrypter does:
 * Encrypt PASS with AES-128, concat all bytes as decimal strings.
 */
function getDerivedPassword() {
  const cipher = crypto.createCipheriv('aes-128-cbc', CONST_01, CONST_02);
  const encrypted = Buffer.concat([cipher.update(PASS, 'utf8'), cipher.final()]);
  // Concat each byte as its decimal string representation (matching C# Aggregate)
  return Array.from(encrypted).map(b => String(b)).join('');
}

/**
 * Derive AES key and IV using PBKDF1 (Rfc2898DeriveBytes).
 * .NET's Rfc2898DeriveBytes uses PBKDF2 with HMAC-SHA1.
 */
function deriveKeyIV(password, salt) {
  // .NET Rfc2898DeriveBytes defaults: 1000 iterations, HMAC-SHA1
  // It derives key then IV sequentially from the same stream
  const derived = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha1');
  return {
    key: derived.subarray(0, 16),  // 128-bit key
    iv: derived.subarray(16, 32),  // 128-bit IV
  };
}

/**
 * Encrypt data to WAFPKG format: GZip → AES-128-CBC
 */
function encryptWafpkg(xmlString) {
  const password = getDerivedPassword();
  const { key, iv } = deriveKeyIV(password, CONST_03);

  // GZip compress
  const compressed = zlib.gzipSync(Buffer.from(xmlString, 'utf8'));

  // AES-128-CBC encrypt
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(compressed), cipher.final()]);
}

/**
 * Inject field values into XAML template content.
 * Finds each FieldRangeStart by AnnotationID and updates the
 * adjacent FieldContentStyle span's Text attribute.
 */
function injectFieldValues(xamlContent, fieldValues) {
  let result = xamlContent;

  for (const [annotationId, value] of Object.entries(fieldValues)) {
    if (!value) continue;

    // Pad value with spaces like the original app does
    const paddedValue = ` ${value} `;

    // Find the FieldRangeStart with this AnnotationID, then update the next FieldContentStyle span
    // Pattern: FieldRangeStart AnnotationID="N" ... /> <t:Span StyleName="FieldContentStyle" Text="..." />
    const pattern = new RegExp(
      `((?:custom1:FieldRangeStart|FieldRangeStart)[^>]*AnnotationID="${annotationId}"[^>]*/>\\s*<t:Span[^>]*StyleName="FieldContentStyle"[^>]*Text=")([^"]*)(")`
    );

    result = result.replace(pattern, `$1${escapeXmlAttr(paddedValue)}$3`);

    // Also handle checkbox fields (IsChecked attribute)
    if (value === 'true' || value === 'false') {
      const cbPattern = new RegExp(
        `((?:custom1:FieldRangeStart|FieldRangeStart)[^>]*AnnotationID="${annotationId}"[^>]*/>\\s*<InlineUIContainer[^>]*>[\\s\\S]*?<av:CheckBox[^>]*IsChecked=")([^"]*)(")`
      );
      result = result.replace(cbPattern, `$1${value === 'true' ? 'True' : 'False'}$3`);
    }
  }

  return result;
}

/**
 * Escape XML attribute value.
 */
function escapeXmlAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * HTML-encode a string (for embedding XAML in the Content element).
 */
function htmlEncode(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build the full WinAirFile XML envelope.
 */
function buildWinAirFileXml(contract, template, fieldValues) {
  const now = new Date().toISOString();
  const filledXaml = injectFieldValues(template.xamlContent, fieldValues);

  return `<?xml version="1.0" encoding="utf-16"?>
<WinAirFile xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Author>${escapeXmlAttr(contract.author || 'david mudge')}</Author>
  <PackageInfo>
    <Name>${escapeXmlAttr(contract.name)}</Name>
    <Author>${escapeXmlAttr(contract.author || 'david mudge')}</Author>
    <AuthorUniqueID>a96f69ff-6791-4d93-8798-e08b80ade250</AuthorUniqueID>
    <CreatedDateTime>${contract.created_at || now}</CreatedDateTime>
    <DateModified>${now}</DateModified>
    <Status>${contract.status}</Status>
    <Description />
    <OpenTime>${new Date().toLocaleString('en-US')}</OpenTime>
  </PackageInfo>
  <PackageSettings>
    <OriginalTextFontSize>10.666667</OriginalTextFontSize>
    <OriginalTextFontFace>Calibri</OriginalTextFontFace>
    <FieldFontFace>Courier New</FieldFontFace>
    <FieldFontSize>10</FieldFontSize>
    <IsFieldFontBold>false</IsFieldFontBold>
    <IsFieldFontItalics>false</IsFieldFontItalics>
    <CustomDefaultFontFace>Georgia</CustomDefaultFontFace>
    <CustomDefaultFontSize>12</CustomDefaultFontSize>
    <IsPageSizeLetter>true</IsPageSizeLetter>
    <IsNumberingContinuous>false</IsNumberingContinuous>
    <DefaultJustification>Left</DefaultJustification>
    <TopMargin>0.5</TopMargin>
    <BottomMargin>0.5</BottomMargin>
    <LeftMargin>0.5</LeftMargin>
    <RightMargin>0.5</RightMargin>
    <IsInFormView>true</IsInFormView>
    <LastFormInFormView>0</LastFormInFormView>
    <LastFieldDataEntryView>0</LastFieldDataEntryView>
    <FormViewZoom>100</FormViewZoom>
    <DataEntryViewZoom>100</DataEntryViewZoom>
  </PackageSettings>
  <PackageRolesConfig>
    <Roles />
    <IsOutdated>false</IsOutdated>
  </PackageRolesConfig>
  <Versions>
    <VersionContent>
      <Author>${escapeXmlAttr(contract.author || 'david mudge')}</Author>
      <AuthorUniqueID>a96f69ff-6791-4d93-8798-e08b80ade250</AuthorUniqueID>
      <Date>${now}</Date>
      <VersionNumber>1</VersionNumber>
      <Description />
      <Forms>
        <AireaDocTemplate>
          <AireaDocTemplateID>${template.templateId}</AireaDocTemplateID>
          <Name>${escapeXmlAttr(template.name)}</Name>
          <Description>${escapeXmlAttr(template.description || '')}</Description>
          <KeyWords>${escapeXmlAttr(template.keywords || '')}</KeyWords>
          <RevisionDate>${template.revisionDate}T00:00:00</RevisionDate>
          <RevisionVersion>${template.revisionVersion}</RevisionVersion>
          <StateVersion>CA</StateVersion>
          <FormCode>${template.formCode}</FormCode>
          <Category>${escapeXmlAttr(template.category || '')}</Category>
          <Credits>${template.credits || 6}</Credits>
          <Status>${contract.status}</Status>
          <Content>${htmlEncode(filledXaml)}</Content>
        </AireaDocTemplate>
      </Forms>
    </VersionContent>
  </Versions>
</WinAirFile>`;
}

/**
 * Export a contract as WAFPKG (encrypted or plain XML).
 *
 * @param {Object} contract - Contract record from DB
 * @param {boolean} encrypt - Whether to AES-encrypt (default true for compatibility)
 * @returns {Buffer} The WAFPKG file content
 */
function exportWafpkg(contract, encrypt = true) {
  // Load template
  const templatePath = path.join(PARSED_DIR, contract.form_code + '.json');
  if (!fs.existsSync(templatePath)) {
    throw new Error('Template not found: ' + contract.form_code);
  }
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));

  // Build XML
  const xml = buildWinAirFileXml(contract, template, contract.field_values || {});

  if (encrypt) {
    return encryptWafpkg(xml);
  }

  return Buffer.from(xml, 'utf8');
}

module.exports = { exportWafpkg, encryptWafpkg, getDerivedPassword, injectFieldValues };
