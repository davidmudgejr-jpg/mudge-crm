// Auth middleware — JWT verification for IE CRM
// Two flavors: requireAuth (blocks if no token) and optionalAuth (continues either way)

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function extractUser(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    return {
      user_id: payload.user_id,
      email: payload.email,
      display_name: payload.display_name,
      role: payload.role || 'broker',
    };
  } catch {
    return null;
  }
}

// Blocks request if no valid token
function requireAuth(req, res, next) {
  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  next();
}

// Attaches user if token present, continues either way
function optionalAuth(req, res, next) {
  req.user = extractUser(req) || null;
  next();
}

// Factory: returns middleware that checks user has one of the allowed roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Generate a JWT for a user
function signToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      email: user.email,
      display_name: user.display_name,
      role: user.role || 'broker',
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { requireAuth, optionalAuth, requireRole, signToken };
