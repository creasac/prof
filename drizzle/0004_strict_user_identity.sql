WITH prepared_user AS (
  SELECT
    "id",
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(coalesce("username", ''))), '[^a-z0-9._]+', '_', 'g'),
          '^[_\.]+|[_\.]+$',
          '',
          'g'
        ),
        '_+',
        '_',
        'g'
      ),
      '\.+',
      '.',
      'g'
    ) AS "normalized_username",
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(coalesce("display_username", ''))), '[^a-z0-9._]+', '_', 'g'),
          '^[_\.]+|[_\.]+$',
          '',
          'g'
        ),
        '_+',
        '_',
        'g'
      ),
      '\.+',
      '.',
      'g'
    ) AS "normalized_display_username",
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(split_part(coalesce("email", ''), '@', 1))), '[^a-z0-9._]+', '_', 'g'),
          '^[_\.]+|[_\.]+$',
          '',
          'g'
        ),
        '_+',
        '_',
        'g'
      ),
      '\.+',
      '.',
      'g'
    ) AS "normalized_email_username",
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(coalesce("name", ''))), '[^a-z0-9._]+', '_', 'g'),
          '^[_\.]+|[_\.]+$',
          '',
          'g'
        ),
        '_+',
        '_',
        'g'
      ),
      '\.+',
      '.',
      'g'
    ) AS "normalized_name_username"
  FROM "user"
),
resolved_user AS (
  SELECT
    "id",
    left(
      coalesce(
        nullif("normalized_username", ''),
        nullif("normalized_display_username", ''),
        nullif("normalized_email_username", ''),
        nullif("normalized_name_username", ''),
        'user'
      ),
      24
    ) AS "resolved_username"
  FROM prepared_user
)
UPDATE "user"
SET
  "name" = regexp_replace(btrim("user"."name"), '\s+', ' ', 'g'),
  "email" = lower(btrim("user"."email")),
  "username" = "resolved_user"."resolved_username"
FROM "resolved_user"
WHERE "resolved_user"."id" = "user"."id";
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "username" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_name_not_blank" CHECK (char_length(btrim("name")) > 0);
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_not_blank" CHECK (char_length(btrim("email")) > 0);
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_not_blank" CHECK (char_length(btrim("username")) > 0);
