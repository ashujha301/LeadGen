"use client";

import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { LeadSummary } from "@/shared/contracts";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent, formatScore } from "@/shared/utils/formatters";
import { LinkedinCell } from "@/features/leads/linkedin-cell";

function formatRoleMatchReason(reason: string): string {
  if (reason.startsWith("seniority:")) {
    return reason.slice("seniority:".length).replace(/_/g, " ");
  }
  if (reason.startsWith("function:")) {
    return reason.slice("function:".length).replace(/_/g, " ");
  }
  if (reason.startsWith("custom:")) {
    return reason.slice("custom:".length);
  }
  return reason;
}

const columnHelper = createColumnHelper<LeadSummary>();

const columns = [
  columnHelper.accessor("personName", {
    header: "Person",
    cell: (info) => (
      <Link
        href={`/leads/${info.row.original.id}`}
        className="font-medium text-accent hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("title", {
    header: "Title",
    cell: (info) => info.getValue() ?? "—",
  }),
  columnHelper.accessor("companyName", { header: "Company" }),
  columnHelper.display({
    id: "linkedin",
    header: "LinkedIn",
    cell: (info) => (
      <LinkedinCell
        linkedinUrl={info.row.original.linkedinUrl}
        enrichmentStatus={info.row.original.enrichmentStatus}
      />
    ),
  }),
  columnHelper.accessor("score", {
    header: "Score",
    cell: (info) => <Badge>{formatScore(info.getValue())}</Badge>,
  }),
  columnHelper.accessor("confidence", {
    header: "Confidence",
    cell: (info) => formatPercent(info.getValue()),
  }),
  columnHelper.accessor("roleMatchReasons", {
    header: "Role match",
    cell: (info) => {
      const reasons = info.getValue();
      if (!info.row.original.roleMatch || reasons.length === 0) {
        return <span className="text-muted">—</span>;
      }

      return (
        <div className="flex max-w-xs flex-wrap gap-1">
          {reasons.map((reason) => (
            <Badge key={reason} variant="secondary" className="capitalize">
              {formatRoleMatchReason(reason)}
            </Badge>
          ))}
        </div>
      );
    },
  }),
  columnHelper.accessor("keyReason", { header: "Why" }),
];

export function LeadTable({ leads }: { leads: LeadSummary[] }) {
  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell className="py-8 text-center text-muted" colSpan={columns.length}>
              No leads found
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
