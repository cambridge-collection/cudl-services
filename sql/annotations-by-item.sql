SELECT
  annotation->>'type' AS type,
  annotation->>'name' AS value,
  (annotation->>'page')::int AS page
FROM
  "DocumentAnnotations",
  json_array_elements(annos->'annotations') AS annotation
WHERE
  "docId" = $1
ORDER BY
    page, type, value;
