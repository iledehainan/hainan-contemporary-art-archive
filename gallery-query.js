'use strict';

module.exports = `
  SELECT id, title, category, year, cover AS image, 'document' AS type
  FROM documents WHERE cover IS NOT NULL AND cover <> ''
  UNION ALL
  SELECT id, name AS title, medium AS category, birth_year AS year, portrait AS image, 'artist' AS type
  FROM artists WHERE portrait IS NOT NULL AND portrait <> ''
  UNION ALL
  SELECT id, title, venue AS category, year, poster AS image, 'exhibition' AS type
  FROM exhibitions WHERE poster IS NOT NULL AND poster <> ''
  ORDER BY year DESC NULLS LAST, id DESC
`;
