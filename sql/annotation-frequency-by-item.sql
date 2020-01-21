SELECT
  annotation->>'name' AS tagname,
  sum((annotation->>'raw')::int)::int AS frequency
FROM
  "DocumentAnnotations",
  json_array_elements(annos->'annotations') AS annotation
WHERE
  "docId" = $1 AND annotation->>'type' != 'date'
GROUP BY tagname
ORDER BY tagname;
