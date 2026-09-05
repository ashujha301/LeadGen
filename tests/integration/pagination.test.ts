import { describe, expect, it } from "vitest";

type PageResult<T> = {
  items: T[];
  nextCursor: string | null;
};

function paginate<T extends { id: string }>(
  all: T[],
  cursor: string | undefined,
  limit: number,
): PageResult<T> {
  const startIdx = cursor ? all.findIndex((item) => item.id === cursor) + 1 : 0;
  const page = all.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < all.length ? (page.at(-1)?.id ?? null) : null;
  return { items: page, nextCursor };
}

describe("cursor pagination", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    score: 100 - i,
  }));

  it("returns the first page with a next cursor", () => {
    const page = paginate(items, undefined, 20);
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe(items[19]?.id ?? null);
  });

  it("returns the remaining items on the second page", () => {
    const first = paginate(items, undefined, 20);
    const second = paginate(items, first.nextCursor ?? undefined, 20);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
  });

  it("returns empty when cursor is at the end", () => {
    const last = paginate(items, items.at(-1)?.id, 20);
    expect(last.items).toHaveLength(0);
    expect(last.nextCursor).toBeNull();
  });
});
