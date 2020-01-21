SELECT
  tag->>'name' AS tagname,
  sum((tag->>'raw')::int)::int AS frequency
FROM
  "DocumentTags",
  json_array_elements(tags->'tags') AS tag
WHERE "docId" = $1
GROUP BY tagname;
