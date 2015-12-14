SELECT
  tag->>'name' AS name,
  (tag->>'raw')::int AS frequency,
  coalesce(removed.count, 0) AS remove_count
FROM
  "DocumentTags",
  json_array_elements(tags->'tags') tag
LEFT JOIN (
  SELECT
    removed_tag->>'name' as tagname,
    count(*) as count
  FROM
    "DocumentRemovedTags",
    json_array_elements(removedtags->'tags') removed_tag
  WHERE "docId" = $1
  GROUP BY tagname
  ORDER BY tagname
) AS removed ON tag->>'name' = removed.tagname
WHERE "docId" = $1
ORDER BY frequency DESC, name, remove_count DESC;
