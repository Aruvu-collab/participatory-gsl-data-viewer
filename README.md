This is a configurable spatial data dashboard built at Aruvu to serve as an accessible repository to view, annotate and download spatial data that has been collected, constructed or adapted.

## Roadmap

- Finalise and finetune the configuration files which lists sources for places
- Introduce base map search
- Licenses, sources and guidelines section for datasets used in a place.
  ... more coming.

## Contribution

This repository uses Sveltekit with Tailwind CSS and ShadCN-Svelte Components. The recommended package manager is Yarn

### Checking and building

Use `yarn run check` and `yarn run build`. Don't run plain `yarn check`: in Yarn 1 that's a different command, which verifies (and downloads) packages instead of running the Svelte type check.

## Community contributions

A page can let invited people map features themselves. They draw a point, line or area, describe it with the page's taxonomy, and the entry is saved as **pending**. A reviewer approves it in QGIS, and approved entries then appear on the map. The first page using this is `crc-bidar-grasslands`.

The server side (PostGIS, PostgREST, GeoServer, invite codes, review in QGIS, schema changes) is documented in [`../infra/README.md`](../infra/README.md). That folder isn't part of this repository.

### How it works for a contributor

1. They open the page from an invite link, `/crc-bidar-grasslands?t=CODE`, or click **+ Contribute** and type the code. The code is kept for the browser session.
2. They choose **Point**, **Line** or **Area** and draw on the map, using Terra Draw. While drawing, clicking map features doesn't open popups.
3. A form asks for:
   - class: only classes that allow the drawn geometry
   - subtype: narrowed by the class
   - state
   - local name
   - notes
   - **author name**: required, and remembered in the browser
4. On submit, the entry shows on the map in **dashed orange**, the pending layer.
5. After a reviewer approves it, it shows **coloured by class**, labelled with its local name, or with the subtype's name when there's no local name.

### Code

| File | Role |
|---|---|
| `src/lib/components/ContributeMode.svelte` | Contribute button, drawing tools, form |
| `src/lib/contribute/validate.ts` | Checks a submission against a taxonomy and bounds. Used by both the form and the server. |
| `src/lib/contribute/load.ts` | Loads a page's `contribute` block and its taxonomy by name |
| `src/lib/contribute/style.ts` | Builds layer colours, labels, legend entries and popup names from the taxonomy (`taxonomy_style`) |
| `src/lib/contribute/state.svelte.ts` | Shared "drawing in progress" flag |
| `src/routes/api/contribute/+server.ts` | Server route that saves through PostgREST |
| `src/lib/contents/taxonomies/*.json` | One taxonomy per project |

### Page configuration

Add a `contribute` block to the page JSON (`src/lib/contents/<slug>.json`):

```json
"contribute": {
	"enabled": true,
	"taxonomy": "one-grasslands",
	"bounds": [76.7, 17.5, 77.8, 18.5],
	"pending_layer": "Contributions_Pending"
}
```

- **`taxonomy`:** the file name in `src/lib/contents/taxonomies/`, without `.json`.
- **`bounds`:** `[west, south, east, north]`, used by the form and the server. The database also checks against `contrib.projects.bounds`, so keep the two the same.
- **`pending_layer`:** the layer the form refreshes after a submission.

The layers that show contributions are ordinary `geojson` layers reading GeoServer WFS, with `"taxonomy_style"` added:

```json
{
	"name": "Contributed_Areas",
	"url": "https://geoserver.livinglabs.network/geoserver/grasslands/ows?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application%2Fjson&maxFeatures=5000&srsName=EPSG:4326&CQL_FILTER=project%3D%27crc-bidar-grasslands%27&typeName=grasslands%3Aone_approved_patches",
	"type": "geojson",
	"legend_group": "Community contributions",
	"taxonomy_style": "area"
}
```

| `taxonomy_style` | GeoServer layer | What it fills in |
|---|---|---|
| `area` | `one_approved_patches` | fill and outline coloured by class, label, legend, popup names |
| `line` | `one_approved_lines` | line coloured by class, label along the line, legend, popup names |
| `point` | `one_approved_points` | circle coloured by class, label, legend, popup names |
| `pending` | `one_pending_public` | dashed orange, no label, a "Waiting for review" legend entry |

- **Generated fields:** `layers_spec`, `label`, `legend_items` and `popup`. Any of them set by hand in the page config takes priority.
- **Without a taxonomy:** these layers fall back to the default `geometry_type` styling.
- **The `CQL_FILTER=project='<slug>'`** keeps each page to its own contributions.

Three general options this adds work for any `geojson` layer, not only contributions:
- **`label`:** can be a MapLibre expression as well as a property name.
- **`legend_items`:** `[{ "label", "color" }]`, shows a colour key under the layer in the legend.
- **`popup`:** `{ "hide": [...], "labels": { key: "Label" }, "values": { key: { code: "Label" } } }`, tidies the feature popup.

### Taxonomy files

`src/lib/contents/taxonomies/<name>.json`:

```json
{
	"name": "Open Natural Ecosystems — Bidar",
	"states": { "remnant": "Remnant / intact", "degraded": "Degraded" },
	"classes": {
		"grassland_scrub": {
			"label": "Grasslands & open scrub",
			"color": "#7cb342",
			"geoms": ["polygon", "line", "point"],
			"subtypes": {
				"native_remnant": { "label": "Remnant native grassland", "osm": { "natural": "grassland" } }
			}
		}
	}
}
```

- **Class `color`:** sets the map colour and the legend swatch.
- **`geoms`:** controls which drawings can use the class.
- **Subtype `osm` tags:** saved with each submission, in the `tags` column, for a later export to OpenStreetMap.
- **Changing labels, colours, subtypes or states** needs no database change. The codes are stored as plain text, so renaming a **code** leaves older rows with the old code.

### Secrets

The server route needs two values. Never commit them.

| Name | Value |
|---|---|
| `PGSL_API_URL` | `https://pgsl-api.livinglabs.network` |
| `PGSL_API_JWT` | The key made from PostgREST's secret (see `infra/README.md`, setup step 6) |

- **Locally:** put them in `frontend/.env`, which is git-ignored. `.env.example` lists them.
- **In production:** add them as Cloudflare Pages/Workers secrets.

### API

`POST /api/contribute` with JSON:

```json
{
	"slug": "crc-bidar-grasslands",
	"token": "CODE",
	"geometry": { "type": "Point", "coordinates": [77.5, 17.9] },
	"one_class": "grassland_scrub",
	"subtype": "native_remnant",
	"one_state": "remnant",
	"local_name": "",
	"notes": "",
	"author_name": "Name"
}
```

| Status | Meaning |
|---|---|
| 200 `{ ok, id }` | Saved as pending |
| 400 | Invalid entry: outside the area, a class not allowed for the shape, a missing author, a broken shape |
| 403 | The invite code is invalid, expired, used up, or belongs to another project |
| 404 | Contributions aren't enabled for this page |
| 413 | The request is too large |
| 429 | Too many submissions for this code this hour |
| 502 / 503 | The API is unreachable or not configured. Details are only logged on the server. |

### Testing locally

1. Fill in `frontend/.env`, then run `yarn dev`.
2. Create a code on the server:
   ```sql
   select contrib.new_token('crc-bidar-grasslands', 'test', 10, 1);
   ```
3. Open `http://localhost:5173/crc-bidar-grasslands?t=CODE`, draw, and submit. The entry should appear in dashed orange.
4. Approve it in QGIS, or with SQL, and reload the page. It should appear coloured by class, labelled, and with a readable popup.
5. Check the error cases: a wrong code, a drawing outside Bidar, an empty author name.
6. Clean up afterwards: delete the test rows and the test codes.

### Adding contributions to another page

1. On the server, add a row to `contrib.projects` with the page's slug and bounds. See `infra/postgis/TOKENS.md`.
2. Add a taxonomy file, or reuse one.
3. Add the `contribute` block and four `taxonomy_style` layers to the page JSON, with the page's own slug in `CQL_FILTER`.
4. Create invite codes with `contrib.new_token('<slug>', …)`.
