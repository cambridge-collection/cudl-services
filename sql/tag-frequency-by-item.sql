SELECT
  tag->>'name' AS tagname,
  (tag->>'raw')::int AS frequency
FROM
  "DocumentTags",
  json_array_elements(tags->'tags') AS tag
WHERE "docId" = $1;
