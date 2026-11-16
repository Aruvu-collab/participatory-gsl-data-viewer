# Invite codes and review

Run these in psql on the server:

```bash
docker exec -it postgis psql -U pgsl_admin -d pgsl
```

A **project** is a dashboard page slug, e.g. `crc-bidar-grasslands`. A code only works on its own project's page.

## Add a project
Each new page that takes contributions needs a row with its mapping area (west, south, east, north):

```sql
insert into contrib.projects (slug, name, bounds)
values ('my-new-page', 'My new page', ST_MakeEnvelope(76.7, 17.5, 77.8, 18.5, 4326));
```

The page's JSON also needs a `"contribute"` block with the same bounds and its taxonomy name
(see `frontend/src/lib/contents/crc-bidar-grasslands.json` and `frontend/src/lib/contents/taxonomies/`).

## Invite codes

```sql
-- new code: project, label, max uses (null = unlimited), valid days (null = never expires), layers (null = all)
select contrib.new_token('crc-bidar-grasslands', 'Bidar workshop Nov 2026', 200, 14);
select contrib.new_token('crc-bidar-grasslands', 'Partner X - points only', null, 90, '{one_points}');

-- overview
select token, project, label, uses, max_uses, expires_at, revoked, last_used_at
from contrib.tokens order by created_at desc;

-- who is editing right now, per code
select token, count(*) as live from contrib.token_presence
where last_seen > now() - interval '75 seconds' group by token;

-- revoke / extend / raise the hourly limit
update contrib.tokens set revoked = true where token = 'CODE';
update contrib.tokens set expires_at = now() + interval '30 days' where token = 'CODE';
update contrib.tokens set hourly_limit = 200 where token = 'CODE';
```

Layers: `one_points`, `one_lines`, `one_patches`.

## Invite link and QR code

```
https://<dashboard-domain>/crc-bidar-grasslands?t=CODE
```

QR code (needs the `qrencode` package):

```bash
qrencode -s 8 -o invite.png "https://<dashboard-domain>/crc-bidar-grasslands?t=CODE"
```

People can also type the code when they click **+ Contribute**.

When Contribute opens, the page checks the code without using it (`api.token_session`, from `sql/06_token_session.sql`)
and switches to the blue editing look. The session panel shows the code's **label as the session name**, the code,
**edits** made with it (pending and approved), how many people are **editing with it right now**, the expiry date and
uses left, plus a **Reset code** button.
Each open tab checks in every 30 seconds; tabs not seen for 75 seconds drop out of the live count, and leaving
Contribute or closing the tab removes it at once.
If the code is revoked, expired, used up or meant for another map, the page asks for a new code straight away,
including in the middle of a session. If a code stops working at submit time, the drawing and form are kept while
the person enters a new one.
So write labels people will recognise, e.g. `Bidar workshop Nov 2026`.

## Review

```sql
-- waiting for review
select id, project, layer, one_class, subtype, author_name, notes, submitted_at
from contrib.one_submissions where status = 'pending' order by submitted_at;

-- approve / reject
update contrib.one_submissions
   set status = 'approved', reviewed_by = 'your name', reviewed_at = now()
 where id in (12, 13);
update contrib.one_submissions
   set status = 'rejected', reviewed_by = 'your name', reviewed_at = now(), review_note = 'duplicate'
 where id = 14;

-- reject everything from a misused code
update contrib.one_submissions set status = 'rejected', review_note = 'revoked code'
 where token = 'CODE' and status = 'pending';
```

To review on a map, connect QGIS over Tailscale: host `<tailscale-ip>` (run `tailscale ip -4` on the server), port `8089`, database `pgsl`,
user `reviewer`. See [../README.md](../README.md#review-in-qgis) for the full QGIS steps.

Approved rows appear on the dashboard the next time the page loads.
