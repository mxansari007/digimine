import * as React from "react";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  /** Cell + header text alignment. Use "right" for numbers/prices. */
  align?: "left" | "right" | "center";
  /** Fixed/min width hint, e.g. "12rem" or "120px". */
  width?: string;
  /** Render numbers with tabular figures so columns line up. */
  numeric?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  loadingState?: React.ReactNode;
  rowClassName?: (row: T, index: number) => string;
  footer?: React.ReactNode;
  /** Make the header stick while the body scrolls vertically. Default true. */
  stickyHeader?: boolean;
  /** Tighter row padding for dense admin lists. */
  dense?: boolean;
  /** How many skeleton rows to show while loading (default 6). */
  skeletonRows?: number;
  /** Optional click handler per row (adds pointer + keyboard affordance). */
  onRowClick?: (row: T, index: number) => void;
}

export interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  /** Disable controls (e.g. while a page is loading). */
  disabled?: boolean;
}

export function getPageCount(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampPage(
  page: number,
  totalItems: number,
  pageSize: number
): number {
  return Math.min(Math.max(1, page), getPageCount(totalItems, pageSize));
}

export function getPaginatedItems<T>(
  items: T[],
  page: number,
  pageSize: number
): T[] {
  const safePage = clampPage(page, items.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function getPageItems(
  page: number,
  pageCount: number
): Array<number | "ellipsis-left" | "ellipsis-right"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis-left" | "ellipsis-right"> = [1];
  if (page > 4) pages.push("ellipsis-left");

  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  for (let current = start; current <= end; current += 1) {
    pages.push(current);
  }

  if (page < pageCount - 3) pages.push("ellipsis-right");
  pages.push(pageCount);
  return pages;
}

const ALIGN_CLASS: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyState = "No records found.",
  isLoading = false,
  loadingState,
  rowClassName,
  footer,
  stickyHeader = true,
  dense = false,
  skeletonRows = 6,
  onRowClick,
}: DataTableProps<T>): React.JSX.Element {
  const cellY = dense ? "py-2.5" : "py-3.5";
  const headProps = (column: DataTableColumn<T>) => ({
    style: column.width ? { width: column.width, minWidth: column.width } : undefined,
  });
  const alignClass = (column: DataTableColumn<T>) =>
    ALIGN_CLASS[column.align ?? "left"];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  {...headProps(column)}
                  className={[
                    "border-b border-slate-200 bg-slate-50/90 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.07em] text-slate-500 backdrop-blur",
                    stickyHeader ? "sticky top-0 z-10" : "",
                    alignClass(column),
                    column.headerClassName || "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              loadingState ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-500">
                    {loadingState}
                  </td>
                </tr>
              ) : (
                Array.from({ length: skeletonRows }).map((_, r) => (
                  <tr key={`sk-${r}`}>
                    {columns.map((column) => (
                      <td key={column.key} className={`border-b border-slate-100 px-4 ${cellY}`}>
                        <Skeleton className={`h-4 ${column.align === "right" ? "ml-auto w-12" : "w-24"}`} />
                      </td>
                    ))}
                  </tr>
                ))
              )
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-slate-500">
                    <svg className="h-8 w-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
                    </svg>
                    <div className="text-sm">{emptyState}</div>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const clickable = Boolean(onRowClick);
                return (
                  <tr
                    key={keyExtractor(row, index)}
                    onClick={clickable ? () => onRowClick?.(row, index) : undefined}
                    className={[
                      "group transition-colors even:bg-slate-50/40 hover:bg-primary-50/50 dark:hover:bg-primary-500/10",
                      clickable ? "cursor-pointer" : "",
                      rowClassName?.(row, index) || "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        style={column.width ? { width: column.width } : undefined}
                        className={[
                          "border-b border-slate-100 px-4 align-middle text-sm text-slate-700",
                          cellY,
                          alignClass(column),
                          column.numeric ? "tabular-nums" : "",
                          column.className || "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {column.render(row, index)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">{footer}</div>
      )}
    </div>
  );
}

export function PaginationControls({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = "records",
  disabled = false,
}: PaginationControlsProps): React.JSX.Element {
  const pageCount = getPageCount(totalItems, pageSize);
  const safePage = clampPage(page, totalItems, pageSize);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{start.toLocaleString()}</span>–
        <span className="font-semibold text-slate-700">{end.toLocaleString()}</span> of{" "}
        <span className="font-semibold text-slate-700">{totalItems.toLocaleString()}</span>{" "}
        {itemLabel}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-slate-500">
            Rows
            <select
              value={pageSize}
              disabled={disabled}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="h-9 px-3"
            aria-label="Previous page"
          >
            Prev
          </Button>
          {getPageItems(safePage, pageCount).map((item) =>
            typeof item === "number" ? (
              <button
                type="button"
                key={item}
                disabled={disabled}
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? "page" : undefined}
                className={`h-9 min-w-9 rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  item === safePage
                    ? "border border-primary-700 bg-primary-700 text-white shadow-sm shadow-primary-950/10"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:bg-primary-50/80 dark:hover:bg-primary-500/15 hover:text-primary-800 dark:hover:text-primary-200"
                }`}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="px-2 text-sm text-slate-400">
                …
              </span>
            )
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || safePage >= pageCount}
            onClick={() => onPageChange(safePage + 1)}
            className="h-9 px-3"
            aria-label="Next page"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
