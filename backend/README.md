# PGSL server: community contributions

This folder holds the server side of the dashboard's **community contributions** feature: the database, the API that saves submissions, the GeoServer layers that show them, and how reviewers approve them. The dashboard side (the Contribute button, the form, the taxonomy and the `/api/contribute` route) is documented in [`../README.md`](../README.md#community-contributions).

This folder is in a public repository, so it holds no passwords or server addresses. Passwords live only in Portainer, Cloudflare and `.env` (git ignores it).

| Path | What it is |
|---|---|
| `postgis/initdb/01_contrib.sh` | Base schema: `contrib.one_submissions`, views, roles |
| `postgis/sql/02_submit_api.sql` | Invite tokens, `api.submit()`, PostgREST roles |
| `postgis/sql/03_projects.sql` | Multi-project support: `contrib.projects`, project on tokens and submissions |
| `postgis/sql/06_token_session.sql` | `api.token_session()` and `contrib.token_presence`: editing sessions. Checks a code without using it, counts edits made with it and people editing with it now. |
| `postgis/gen-jwt.sh` | Makes the key (JWT) the dashboard uses to call PostgREST |
| `postgis/TOKENS.md` | Invite codes, invite links and QR codes, approving with SQL |
| `geoserver/setup-contrib.sh` | Publishes the read-only layers through GeoServer's REST API (the UI steps below are an alternative) |
| `PLAN-generic-attributes.md` | Deferred plan: per-project attributes and neutral names |
| `postgis/docker-compose.*.yml` | Earlier drafts. The live stack is the one below, kept in Portainer. |

## How it fits together

```
Contributor's browser
   │  draws + fills the form on /crc-bidar-grasslands
   ▼
Dashboard (SvelteKit on Cloudflare)  POST /api/contribute
   │  checks the entry against the project's taxonomy
   │  POST /rpc/submit  +  Authorization: Bearer <PGSL_API_JWT>
   ▼
pgsl-api.livinglabs.network  ── Cloudflare Tunnel (cloudflared, separate container) ──►  localhost:8090
   ▼
PostgREST  (role web_writer can only run api.submit)
   ▼
PostGIS  contrib.one_submissions   (status = pending)
   ▲                                     │
   │ reviewers edit status in QGIS       │ views (approved / pending)
   │ over Tailscale, <tailscale-ip>:8089  ▼
   │                               GeoServer  grasslands:contrib_ro  (WFS, read-only)
   │                                     ▼
   └──────────────────────────────  dashboard map layers
```

- **Writes** only go through `api.submit`. It checks the invite code (and that it belongs to the project), the hourly limit, the author name and the mapping area, then saves the row. A trigger forces every web submission to `pending`.
- **Reads** go through GeoServer views that only expose safe columns. The `token` column is never published.

## The Portainer stack

GeoServer, PostGIS, PostgREST and the backups run in **one Portainer stack**. cloudflared runs separately, with its own tunnel.

```yaml
services:
  geoserver:
    image: docker.osgeo.org/geoserver:3.1.x
    container_name: geoserver
    ports:
      - "8088:8080"
    volumes:
      - /srv/dev-disk-by-uuid-5252cb91-04ea-4cf3-91fc-0e0c1ba04117/geoserver-data:/opt/geoserver_data
    environment:
      - INSTALL_EXTENSIONS=true
      - STABLE_EXTENSIONS=vectortiles,gdal,css,mbstyle
      - COMMUNITY_EXTENSIONS=flatgeobuf
      - ENABLE_JSONP=true
      - CORS_ENABLED=true
      - CORS_ALLOWED_ORIGINS=*
      - GEOSERVER_CSRF_WHITELIST=geoserver.livinglabs.network
      - CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,HEAD,OPTIONS
      - CORS_ALLOWED_HEADERS=Origin,X-Requested-With,Content-Type,Accept,Authorization
      - CORS_ALLOW_CREDENTIALS=false
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: '4'
    restart: always
    networks: [gisnet]

  postgis:
    image: postgis/postgis:16-3.4
    container_name: postgis
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - /root/pgsl/pgdata:/var/lib/postgresql/data
      - /root/pgsl/initdb:/docker-entrypoint-initdb.d:ro
    # Published on all interfaces; reviewers reach it over Tailscale at <tailscale-ip>:8089
    ports:
      - "8089:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      retries: 5
    networks: [gisnet]

  postgrest:
    image: postgrest/postgrest:v12.2.3
    container_name: postgrest
    restart: unless-stopped
    depends_on:
      postgis:
        condition: service_healthy
    environment:
      PGRST_DB_URI: postgres://authenticator:${AUTHENTICATOR_PASSWORD}@postgis:5432/${POSTGRES_DB}
      PGRST_DB_SCHEMAS: api
      PGRST_DB_ANON_ROLE: web_anon
      PGRST_JWT_SECRET: ${PGRST_JWT_SECRET}
      PGRST_OPENAPI_MODE: disabled
    # Local only. Cloudflare tunnel route: pgsl-api.livinglabs.network -> http://localhost:8090
    ports:
      - "127.0.0.1:8090:3000"
    networks: [gisnet]

  pgbackup:
    image: prodrigestivill/postgres-backup-local:16
    restart: unless-stopped
    depends_on: [postgis]
    environment:
      POSTGRES_HOST: postgis
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      SCHEDULE: "@daily"
      BACKUP_KEEP_DAYS: 7
      BACKUP_KEEP_WEEKS: 4
      BACKUP_KEEP_MONTHS: 6
    volumes:
      - /root/pgsl/backups:/backups
    networks: [gisnet]

networks:
  gisnet:
    name: gisnet
```

**Stack environment variables** (set in Portainer under *Environment variables*; never commit them):

| Variable | Used for |
|---|---|
| `POSTGRES_DB` | Database name, `pgsl` |
| `POSTGRES_USER` | Admin user, `pgsl_admin` |
| `POSTGRES_PASSWORD` | Admin password |
| `AUTHENTICATOR_PASSWORD` | Password of the `authenticator` role that PostgREST logs in as. Must match the database. |
| `PGRST_JWT_SECRET` | Secret PostgREST uses to check the dashboard's key. 32 characters or more. |

**Ports:**

| Port | Service | Reachable from |
|---|---|---|
| 8088 | GeoServer | the network, plus the existing tunnel (`geoserver.livinglabs.network`) |
| 8089 | PostGIS | **every interface**; reviewers use Tailscale `<tailscale-ip>:8089` |
| 127.0.0.1:8090 | PostgREST | the server only; the tunnel route `pgsl-api.livinglabs.network → http://localhost:8090` |

`<tailscale-ip>` is the server's Tailscale address: run `tailscale ip -4` on the server, or look it up in the Tailscale admin console.

## First-time setup

This is the order that worked. Run the commands on the server.

1. **Deploy the stack** in Portainer with the environment variables above.

   PostgreSQL only runs `initdb/` scripts on an **empty** data folder. In a Portainer stack, relative paths have no project folder, so use absolute host paths, as above.

2. **Base schema.** If `/root/pgsl/initdb/01_contrib.sh` didn't run on first start, run it by hand. The three role passwords must be passed in as variables:
   ```bash
   docker exec -u postgres -it \
     -e GS_CONTRIB_RW_PASSWORD='…' -e GS_CONTRIB_RO_PASSWORD='…' -e REVIEWER_PASSWORD='…' \
     postgis bash /docker-entrypoint-initdb.d/01_contrib.sh
   ```
   `GS_CONTRIB_RW_PASSWORD` creates a role that is no longer used, since GeoServer doesn't write; any value works.

3. **API and tokens.** Copy `postgis/sql/02_submit_api.sql` to the server, keep it **outside** `initdb/`, and run:
   ```bash
   docker exec -i postgis psql -v ON_ERROR_STOP=1 -U pgsl_admin -d pgsl \
     -v auth_pw='<AUTHENTICATOR_PASSWORD>' -f - < 02_submit_api.sql
   ```
   Pass the password with `-v auth_pw=…`. Don't edit it into the file.

4. **Projects:**
   ```bash
   docker exec -i postgis psql -v ON_ERROR_STOP=1 -U pgsl_admin -d pgsl < 03_projects.sql
   docker restart postgrest
   ```

5. **Check PostgREST:**
   ```bash
   docker logs postgrest --tail 20     # "Successfully connected", "Schema cache loaded … 1 Functions"
   curl -i http://127.0.0.1:8090/       # 404 with {} is correct
   ```
   Then add the tunnel route `pgsl-api.livinglabs.network → http://localhost:8090` in Cloudflare Zero Trust. From any machine, `curl -i https://pgsl-api.livinglabs.network/` should now return 404 with `{}`.

6. **Make the dashboard's key.** On the server, this reads the secret from the running container:
   ```bash
   SECRET=$(docker inspect postgrest --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^PGRST_JWT_SECRET=//p')
   b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
   h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64)
   p=$(printf '{"role":"web_writer"}' | b64)
   s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$SECRET" -binary | b64)
   echo "$h.$p.$s"
   ```
   `postgis/gen-jwt.sh` does the same on any machine. The output becomes `PGSL_API_JWT` in Cloudflare and in `frontend/.env`.

7. **Publish the GeoServer layers.** See below.

8. **Create an invite code and test.** See `postgis/TOKENS.md` and the frontend README.

## GeoServer layers

The dashboard reads contributions through four read-only layers in the **`grasslands`** workspace, on a store called `contrib_ro` that logs in as `gs_contrib_ro`.

1. **Data → Stores → Add new Store → PostGIS**, and fill in:
   - workspace `grasslands`, name `contrib_ro`
   - host `postgis`, port `5432`, database `pgsl`, schema `contrib`
   - user `gs_contrib_ro` and its password
   - untick **Estimated extends**
2. Publish `one_approved_patches`, `one_approved_lines`, `one_approved_points` and `one_pending_public`. On each layer's **Data** tab:
   - **Declared SRS** `EPSG:4326`, **Force declared**
   - Native bounding box: **Compute from SRS bounds**, which gives −180, −90, 180, 90
   - Lat/Lon bounding box: **Compute from native bounds**
   - Save
3. Check: **Layer Preview → GeoJSON** should open without a login.

No security rules or WFS-T setting are needed, because GeoServer only reads.

**After any schema change** that touches these views: open each affected layer, click **Data → Reload feature type**, then **Save**.

## Invite codes

See [`postgis/TOKENS.md`](postgis/TOKENS.md). The short version:

```sql
select contrib.new_token('crc-bidar-grasslands', 'Bidar workshop Nov 2026', 200, 14);
update contrib.tokens set revoked = true where token = 'CODE';
```

The invite link is `https://<dashboard>/crc-bidar-grasslands?t=CODE`.

## Review in QGIS

Reviewers connect straight to PostGIS over **Tailscale**. SSH tunnels don't work, because the server (OpenMediaVault) refuses TCP forwarding.

1. **Connect once.** In the Browser panel, right-click **PostgreSQL → New Connection**:
   - host `<tailscale-ip>` (only the IP, no `http://` and no port), port `8089`
   - database `pgsl`, user `reviewer`
   - leave **Service** empty
   - click Test Connection
2. **Load** `contrib → one_submissions`. QGIS lists it once for each geometry type; add the ones you need. Right-click it, choose **Filter…**, and enter `"status" = 'pending'`.
3. **Review.** Toggle editing (the pencil), then use the Identify tool or the attribute table to set:
   - `status`: `approved` or `rejected`
   - `reviewed_by`: your name
   - `reviewed_at`: `now()`
   - `review_note`: optional

   You may also correct `one_class`, `subtype`, `one_state` or the shape.
4. **Save Layer Edits.** Approved features appear on the dashboard the next time the page loads.

**Deleting:** reviewers can delete submissions: in QGIS, select the features, click **Delete Selected**, then save. Deletion is permanent. Prefer `status = 'rejected'` with a `review_note` for spam or mistakes you may want a record of; delete only test entries and clear junk. (Grant, if missing: `grant delete on contrib.one_submissions to reviewer;`)

**Approving several at once:** select them, open the Field Calculator, tick **Only update selected features**, and update `status` with `'approved'`, `reviewed_at` with `now()` and `reviewed_by` with `'Name'`.

**An optional form setup**, saved in a shared `pgsl-review.qgz` (Layer Properties → Attributes Form):
- `status`: *Value Map* widget with `pending`, `approved` and `rejected`
- `reviewed_at`: default `now()`, *Apply default value on update*
- `reviewed_by`: default `@user_account_name`
- `token`, `author_name`, `submitted_at`, `project`: not editable

The `reviewer` role can only change `status`, `reviewed_by`, `reviewed_at`, `review_note`, `one_class`, `subtype`, `one_state` and `geom`. Editing any other column fails with *permission denied*.

Without QGIS:
```bash
docker exec postgis psql -U pgsl_admin -d pgsl -c "update contrib.one_submissions set status='approved', reviewed_by='Name', reviewed_at=now() where id=12;"
```

## Changing the schema

**Yes, you can change it yourself.** Connect as `pgsl_admin`:
```bash
docker exec -it postgis psql -U pgsl_admin -d pgsl
```
Some changes need follow-up steps elsewhere, so check this list first.

**No database change needed:** editing the taxonomy (classes, subtypes, states, colours, labels) in `frontend/src/lib/contents/taxonomies/*.json`. The database stores the codes as plain text, and the dashboard checks them. Redeploy the dashboard after editing.

**Adding a column:**
1. Back up first (see below).
2. `alter table contrib.one_submissions add column …;`
3. If it should be public, add it to the views. `create or replace view` can only add columns **at the end** of the existing list.
4. In GeoServer, click **Reload feature type** on each affected layer.
5. If contributors should fill it in:
   - drop and recreate `api.submit` with the new parameter
   - re-run the `revoke … from public` / `grant execute … to web_writer` lines
   - add the field to `frontend/src/lib/contribute/validate.ts`, `ContributeMode.svelte` and `src/routes/api/contribute/+server.ts`
   - reload PostgREST with `notify pgrst, 'reload schema';` or `docker restart postgrest`
6. If reviewers should edit it: `grant update (new_column) on contrib.one_submissions to reviewer;`

**Renaming or dropping a column:**
- The views depend on it, so drop the views, change the table, then recreate the views and their grants: `grant select … to gs_contrib_ro`.
- Reload the feature types in GeoServer.
- Update the dashboard: the taxonomy-driven styles read `one_class`, `subtype` and `local_name`, and the popup config hides `tags`, `project` and `id`.

**Don't change:**
- the `force_pending` trigger, which stops contributors approving their own entries
- the grants on the roles
- `security definer` and `set search_path` on `api.submit`

**Always:**
- wrap changes in `begin; … commit;`, so a mistake rolls back
- for anything non-trivial, restore a backup into a scratch database first and try it there

## Backups

`pgbackup` writes a compressed dump every day to `/root/pgsl/backups`, keeping 7 daily, 4 weekly and 6 monthly. Copy them off the server too, e.g. with rsync to Nextcloud.

Take a backup by hand before a schema change:
```bash
docker exec postgis pg_dump -U pgsl_admin -d pgsl -Fc > pgsl-$(date +%F).dump
```

**Restore into a scratch database** to test:
```bash
docker exec postgis createdb -U pgsl_admin pgsl_test
docker exec -i postgis pg_restore -U pgsl_admin -d pgsl_test < pgsl-YYYY-MM-DD.dump
```

## Security notes

- **PostGIS port 8089 is published on all interfaces.**
  - Docker writes its own firewall rules, which **bypass** `ufw` and OpenMediaVault's firewall.
  - Never forward 8089 on the router.
  - Use long random passwords for `pgsl_admin`, `reviewer`, `gs_contrib_ro` and `authenticator`, because `pg_hba.conf` accepts password logins from any address.
  - For a tighter setup, bind it to `<tailscale-ip>:8089:5432`, or use `127.0.0.1:8089:5432` plus `tailscale serve --tcp 5432 tcp://localhost:8089`.
- **The dashboard key (`PGSL_API_JWT`):**
  - it's only stored in Cloudflare secrets and `frontend/.env`
  - anyone with it can call `api.submit`, but still needs a valid invite code
  - to rotate it, change `PGRST_JWT_SECRET`, update the stack, make a new key and update Cloudflare
- **What's never published:** `token` in the views, and the PostgREST API documentation (`PGRST_OPENAPI_MODE: disabled`).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `\dt contrib.*` finds nothing; `/docker-entrypoint-initdb.d/` is empty in the container | The `initdb` mount pointed at a folder that didn't exist, so Docker created an empty one. Use an absolute host path, and run the script by hand (setup step 2). Init scripts only run on an empty data folder. |
| `line 4: GS_CONTRIB_RW_PASSWORD: unbound variable` | The password variables weren't passed in. Add them with `-e` on `docker exec` (setup step 2). |
| `syntax error at or near ":"` on `create role authenticator … password :'…'` | `:'auth_pw'` is a psql variable. Either pass `-v auth_pw='…'`, or write a plain `'…'` with no colon. |
| PostgREST log: `role "authenticator" does not exist` | `02_submit_api.sql` hasn't run, or stopped before the role lines. Run the remaining lines and restart postgrest. |
| `503 PGRST002 Could not query the database for the schema cache` | PostgREST is still starting. Wait a few seconds and retry. |
| `https://pgsl-api…` returns **502** | cloudflared can't reach PostgREST. Check `curl http://127.0.0.1:8090/` on the server, then the tunnel route: `http://localhost:8090`, or `http://postgrest:3000` if cloudflared is joined to `gisnet`. |
| GeoServer: *"minimum boundary value for axis X/Y is higher or equal to the maximum"* | The views are empty, so GeoServer computes an inverted box. Use **Compute from SRS bounds** for the native box, then **Compute from native bounds**. |
| SSH tunnel: `channel 2: open failed: administratively prohibited` | OpenMediaVault disables SSH TCP forwarding. Use Tailscale (`<tailscale-ip>:8089`) instead. |
| QGIS: *could not translate host name to address* | The Host field has a typo or something extra, e.g. a `:` instead of a `.`, a port or `http://`, or **Service** isn't empty. Enter only `<tailscale-ip>`, with the port in its own field. |
| Saving in QGIS: *permission denied* | A column the reviewer can't change was edited. Undo that change. |
| `submit` returns `Invite code is invalid or expired` | The code is wrong, revoked, expired or used up, or it belongs to another project. See `postgis/TOKENS.md`. |
