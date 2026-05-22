import * as React from "react";
import { Button } from "./Button";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
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
}

export interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
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

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyState = "No records found.",
  isLoading = false,
  loadingState = "Loading records...",
  rowClassName,
  footer,
}: DataTableProps<T>): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-900/5 backdrop-blur">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-left">
          <thead className="bg-slate-50/80">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-5 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 ${column.headerClassName || ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80 bg-white/70">
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-12 text-center text-sm text-slate-500"
                >
                  {loadingState}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-12 text-center text-sm text-slate-500"
                >
                  {emptyState}
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={keyExtractor(row, index)}
                  className={`transition-colors hover:bg-primary-50/40 ${rowClassName?.(row, index) || ""}`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-5 py-4 align-middle text-sm text-slate-600 ${column.className || ""}`}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
          {footer}
        </div>
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
  pageSizeOptions = [5, 10, 20, 50],
  itemLabel = "records",
}: PaginationControlsProps): React.JSX.Element {
  const pageCount = getPageCount(totalItems, pageSize);
  const safePage = clampPage(page, totalItems, pageSize);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{start}</span> to{" "}
        <span className="font-semibold text-slate-700">{end}</span> of{" "}
        <span className="font-semibold text-slate-700">{totalItems}</span>{" "}
        {itemLabel}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-slate-500">
            Rows
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-9 rounded-lg border border-slate-200/90 bg-white/90 px-2 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
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
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="h-9 px-3"
          >
            Prev
          </Button>
          {getPageItems(safePage, pageCount).map((item) =>
            typeof item === "number" ? (
              <button
                type="button"
                key={item}
                onClick={() => onPageChange(item)}
                className={`h-9 min-w-9 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  item === safePage
                    ? "border border-primary-700 bg-primary-700 text-white shadow-sm shadow-primary-950/10"
                    : "border border-slate-200/90 bg-white/90 text-slate-600 hover:border-primary-200/90 hover:bg-primary-50/80 hover:text-primary-800"
                }`}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="px-2 text-sm text-slate-400">
                ...
              </span>
            )
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount}
            onClick={() => onPageChange(safePage + 1)}
            className="h-9 px-3"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
