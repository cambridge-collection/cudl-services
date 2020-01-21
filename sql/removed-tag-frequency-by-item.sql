SELECT
  tag->>'name' AS tagname,
  sum((tag->>'raw')::int)::int as frequency
FROM
  "DocumentRemovedTags",
  json_array_elements(removedtags->'tags') as tag
WHERE "docId" = $1
GROUP BY tagname;
