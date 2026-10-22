// Size charts (Q8-3): a name, a unit, and a table of measurements per size,
// edited as rows (sizes) and columns (measurements such as Bust or Length).
import { useState, type FormEvent } from "react";

import { api, toApiError, type ApiError } from "../api/client.ts";
import type { List, SizeChart } from "../api/types.ts";
import { useResource } from "../lib/resource.ts";
import { Button, SelectField, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  Empty,
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import s from "./catalogue.module.css";

type Grid = { columns: string[]; rows: { size: string; values: string[] }[] };

export function toGrid(chart: SizeChart | null): Grid {
  if (!chart || chart.rows.length === 0)
    return {
      columns: ["Bust", "Length"],
      rows: [{ size: "", values: ["", ""] }],
    };
  const columns = [
    ...new Set(chart.rows.flatMap((r) => Object.keys(r.measurements))),
  ];
  return {
    columns,
    rows: chart.rows.map((r) => ({
      size: r.size,
      values: columns.map((c) =>
        r.measurements[c] === undefined ? "" : String(r.measurements[c]),
      ),
    })),
  };
}

/** Grid to the API's rows; empty cells are left out, bad numbers reported. */
export function fromGrid(grid: Grid): {
  rows: SizeChart["rows"];
  problem: string | null;
} {
  const rows: SizeChart["rows"] = [];
  for (const [i, row] of grid.rows.entries()) {
    if (!row.size.trim() && row.values.every((v) => !v.trim())) continue;
    if (!row.size.trim())
      return { rows, problem: `Row ${i + 1} needs a size.` };
    const measurements: Record<string, number> = {};
    for (const [j, column] of grid.columns.entries()) {
      const raw = row.values[j]?.trim() ?? "";
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 500)
        return {
          rows,
          problem: `Row ${i + 1}, ${column || `column ${j + 1}`}: enter a number from 0 to 500.`,
        };
      if (!column.trim())
        return { rows, problem: `Column ${j + 1} needs a name.` };
      measurements[column.trim()] = n;
    }
    rows.push({ size: row.size.trim(), measurements });
  }
  return { rows, problem: null };
}

export function SizeCharts() {
  const list = useResource<SizeChart[]>(
    async (signal) =>
      (await api.get<List<SizeChart>>("/admin/size-charts", { signal })).items,
    [],
  );
  const [editing, setEditing] = useState<SizeChart | null>(null);
  // A new key after each save gives an empty form for the next item.
  const [formVersion, setFormVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  if (list.status === "loading")
    return <Loading label="Loading size charts…" />;
  if (list.status === "error")
    return <ErrorState error={list.error} onRetry={list.reload} />;

  return (
    <Stack gap="6">
      <PageHeader
        title="Size charts"
        description="Measurements shown on product pages. Enter only measured values."
      />
      {message ? <Notice tone="success" title={message} /> : null}
      <Panel title="All size charts">
        {list.data.length === 0 ? (
          <Empty>
            <p>No size charts yet.</p>
          </Empty>
        ) : (
          <ul className={s.tree}>
            {list.data.map((c) => (
              <li key={c.id} className={s.treeItem}>
                <span>{c.name}</span>
                <span className={ui.hint}>
                  {c.rows.length} {c.rows.length === 1 ? "size" : "sizes"} ·{" "}
                  {c.unit === "CM" ? "centimetres" : "inches"}
                </span>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setEditing(c)}
                  aria-label={`Edit ${c.name}`}
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <SizeChartForm
        key={editing?.id ?? `new-${formVersion}`}
        editing={editing}
        onCancel={() => setEditing(null)}
        onSaved={(name, created) => {
          setMessage(created ? `“${name}” created.` : `“${name}” saved.`);
          setEditing(null);
          setFormVersion((v) => v + 1);
          list.reload();
        }}
      />
    </Stack>
  );
}

function SizeChartForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: SizeChart | null;
  onSaved: (name: string, created: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [unit, setUnit] = useState<SizeChart["unit"]>(editing?.unit ?? "IN");
  const [grid, setGrid] = useState<Grid>(toGrid(editing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const setCell = (r: number, c: number, value: string) =>
    setGrid((g) => ({
      ...g,
      rows: g.rows.map((row, i) =>
        i === r
          ? { ...row, values: row.values.map((v, j) => (j === c ? value : v)) }
          : row,
      ),
    }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { rows, problem: p } = fromGrid(grid);
    setProblem(p);
    if (p) return;
    setBusy(true);
    setError(null);
    try {
      const body = { name, unit, rows };
      if (editing) await api.patch(`/admin/size-charts/${editing.id}`, body);
      else await api.post("/admin/size-charts", body);
      onSaved(name, !editing);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  return (
    <Panel title={editing ? `Edit “${editing.name}”` : "New size chart"}>
      <form onSubmit={submit} noValidate>
        <Stack>
          <ErrorSummary
            error={error}
            fields={fields}
            idPrefix="chart-"
            labels={{ name: "Name", unit: "Unit" }}
          />
          {problem ? <Notice tone="error" title={problem} /> : null}
          <div className={s.twoColumns}>
            <TextField
              id="chart-name"
              label="Name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fields.name}
            />
            <SelectField
              id="chart-unit"
              label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as SizeChart["unit"])}
            >
              <option value="IN">Inches</option>
              <option value="CM">Centimetres</option>
            </SelectField>
          </div>
          <TableRegion label="Measurements table">
            <table className={`${ui.table} ${s.sizeTable}`}>
              <caption className="visually-hidden">
                Measurements by size
              </caption>
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  {grid.columns.map((column, j) => (
                    <th scope="col" key={j}>
                      <label className="visually-hidden" htmlFor={`col-${j}`}>
                        Measurement {j + 1} name
                      </label>
                      <input
                        id={`col-${j}`}
                        className={ui.control}
                        value={column}
                        maxLength={40}
                        onChange={(e) =>
                          setGrid((g) => ({
                            ...g,
                            columns: g.columns.map((c, k) =>
                              k === j ? e.target.value : c,
                            ),
                          }))
                        }
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <label className="visually-hidden" htmlFor={`size-${i}`}>
                        Row {i + 1} size
                      </label>
                      <input
                        id={`size-${i}`}
                        className={ui.control}
                        value={row.size}
                        maxLength={20}
                        onChange={(e) =>
                          setGrid((g) => ({
                            ...g,
                            rows: g.rows.map((r, k) =>
                              k === i ? { ...r, size: e.target.value } : r,
                            ),
                          }))
                        }
                      />
                    </td>
                    {grid.columns.map((column, j) => (
                      <td key={j}>
                        <label
                          className="visually-hidden"
                          htmlFor={`cell-${i}-${j}`}
                        >
                          {row.size || `Row ${i + 1}`}{" "}
                          {column || `measurement ${j + 1}`}
                        </label>
                        <input
                          id={`cell-${i}-${j}`}
                          className={ui.control}
                          inputMode="decimal"
                          value={row.values[j] ?? ""}
                          onChange={(e) => setCell(i, j, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
          <Cluster gap="2">
            <Button
              variant="secondary"
              size="small"
              disabled={grid.rows.length >= 20}
              onClick={() =>
                setGrid((g) => ({
                  ...g,
                  rows: [
                    ...g.rows,
                    { size: "", values: g.columns.map(() => "") },
                  ],
                }))
              }
            >
              Add size row
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={grid.columns.length >= 12}
              onClick={() =>
                setGrid((g) => ({
                  columns: [...g.columns, ""],
                  rows: g.rows.map((r) => ({
                    ...r,
                    values: [...r.values, ""],
                  })),
                }))
              }
            >
              Add measurement
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={grid.rows.length <= 1}
              onClick={() =>
                setGrid((g) => ({ ...g, rows: g.rows.slice(0, -1) }))
              }
            >
              Remove last row
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={grid.columns.length <= 1}
              onClick={() =>
                setGrid((g) => ({
                  columns: g.columns.slice(0, -1),
                  rows: g.rows.map((r) => ({
                    ...r,
                    values: r.values.slice(0, -1),
                  })),
                }))
              }
            >
              Remove last measurement
            </Button>
          </Cluster>
          <Cluster>
            <Button type="submit" busy={busy} busyLabel="Saving…">
              {editing ? "Save size chart" : "Create size chart"}
            </Button>
            {editing ? (
              <Button variant="quiet" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </Cluster>
        </Stack>
      </form>
    </Panel>
  );
}
