# CoStar Star Ratings — Reference for IE CRM

> Added: 2026-03-10
> Source: CoStar "Understanding Building Class vs. CoStar Star Ratings" document
> Purpose: Future integration into TPE scoring and property quality assessment

---

## Why This Matters for the CRM

The CRM currently tracks `building_class` (A/B/C) which is **broker-reported and market-relative**. A Class A in the Inland Empire may not equal a Class A in LA. These classifications are subjective and inconsistent — David has noted that buildings are frequently misclassified (e.g., a "Class B" that's really a Class C).

CoStar Star Ratings (1–5) solve this by providing a **nationally standardized, data-driven** quality metric. When both metrics are available, divergences between them (e.g., Class A but only 2 stars, or Class C but 4 stars) can flag mispriced or overlooked properties.

---

## Building Class (A/B/C) — What We Already Have

- Determined locally, market-relative
- Reflects how a property compares to **other buildings in the same market**
- Influenced by local standards, market perception, and competitive positioning
- A Class A in one market may not be equivalent to a Class A in another
- **Weakness:** Broker-reported, subjective, inconsistent across markets

## CoStar Star Ratings (1–5) — What We Want to Add

- Nationally standardized evaluation of a building's **intrinsic quality**
- Assigned using consistent criteria across all U.S. markets
- Allows true apples-to-apples comparisons nationwide

### Factors CoStar Considers:

1. **Building design and construction quality**
2. **Property condition, renovations, and maintenance**
3. **Building systems, amenities, and site features**
4. **Property-type specific standards**
5. **Ongoing field research and verified data**

### Key Insight

A 4-Star building in the Inland Empire is directly comparable to any other 4-Star building nationwide, regardless of its local class designation. This is the critical difference — class is relative, stars are absolute.

---

## How Professionals Use Both Together

Class ratings help understand **local market positioning**, while CoStar Star Ratings provide a **consistent national benchmark** for quality and comparability.

---

## Planned CRM Integration

### Database Field

```sql
ALTER TABLE properties ADD COLUMN costar_star_rating INTEGER CHECK (costar_star_rating BETWEEN 1 AND 5);
```

- **Column:** `costar_star_rating`
- **Type:** INTEGER (1–5)
- **Source:** Pulled from CoStar during property import (same workflow as building_class)
- **Nullable:** Yes — not all properties will have a CoStar rating

### TPE Integration (Future)

The CoStar Star Rating can enhance the TPE scoring model in several ways:

1. **Age Score Modifier (within the 20-point Age bucket):**
   - Currently Age Score is purely based on `year_built` tiers
   - A renovated 1980s building (4-star) should score differently than a neglected 1980s building (2-star)
   - Star rating captures renovations, systems, and condition that `year_built` alone misses
   - Possible formula: `age_score = base_age_score * star_modifier` where star_modifier ranges from 0.6 (1-star) to 1.2 (5-star)

2. **Class Divergence Signal:**
   - When `building_class` and `costar_star_rating` disagree, flag the property
   - High class + low stars = potentially overvalued / listing opportunity
   - Low class + high stars = potentially undervalued / acquisition opportunity
   - Could feed into a future "Opportunity Score" or alert system

3. **Comp Quality Matching:**
   - When pulling comparable properties, star rating provides a better quality match than class alone
   - A 3-star Class B is more comparable to another 3-star Class B than to a 5-star Class B

### CoStar Import Workflow

When pulling properties from CoStar (via CSV export or future API):
- `building_class` → existing field (already mapped)
- `costar_star_rating` → new field (add to import mapping)
- Both should be captured in every CoStar import going forward

---

## Implementation Priority

**Not blocking anything right now.** This is a future enhancement to be added when:
1. The TPE SQL VIEW (`property_tpe_scores`) is being built
2. The CoStar CSV import pipeline is being refined
3. The scoring model is being tuned with real data

The column can be added in the next batch migration alongside the other missing TPE columns (`owner_entity_type`, `owner_age_est`, etc. per HANDOFF.md Phase 1E gaps).
