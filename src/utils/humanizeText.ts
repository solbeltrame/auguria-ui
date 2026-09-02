const TABLE_SEPARATOR = /^:?-{3,}:?$/;

function tableCells(line: string): string[] | undefined {
  const trimmed = line.trim();
  const pipeCount = (trimmed.match(/\|/g) ?? []).length;
  if (pipeCount < 2 && !trimmed.startsWith("|")) return undefined;

  const value = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailingPipe = value.endsWith("|") ? value.slice(0, -1) : value;
  const cells = withoutTrailingPipe.split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : undefined;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^\s)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/`{1,3}/g, "")
    .replace(/(\*\*\*|___)(?=\S)([^*_\n]*?\S)\1/g, "$2")
    .replace(/(\*\*|__)(?=\S)([^*_\n]*?\S)\1/g, "$2")
    .replace(/(?<![\p{L}\p{N}])\*([^*\n]+?)\*(?![\p{L}\p{N}])/gu, "$1")
    .replace(/(?<![\p{L}\p{N}])_([^_\n]+?)_(?![\p{L}\p{N}])/gu, "$1")
    .replace(/~~([^~\n]+?)~~/g, "$1")
    .replace(/(^|[^\p{L}\p{N}])\*{1,3}(?=\S)/gu, "$1")
    .replace(/(?<=\S)\*{1,3}(?=$|[^\p{L}\p{N}])/gu, "")
    .replace(/(^|[^\p{L}\p{N}])_{1,3}(?=\S)/gu, "$1")
    .replace(/(?<=\S)_{1,3}(?=$|[^\p{L}\p{N}])/gu, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function humanizeTable(rows: string[][]): string[] {
  const usable = rows.filter(
    (row) => !row.every((cell) => TABLE_SEPARATOR.test(cell)),
  );
  if (usable.length < 2) {
    return usable.map((row) => stripInlineMarkdown(row.join("; ")));
  }

  const headers = usable[0];
  return usable
    .slice(1)
    .map((row) => {
      const values = row
        .map((cell, index) => {
          const value = stripInlineMarkdown(cell);
          if (!value) return "";
          const label = stripInlineMarkdown(
            headers[index] ?? `Item ${index + 1}`,
          );
          return label ? `${label}: ${value}` : value;
        })
        .filter(Boolean);
      return values.length ? `• ${values.join("; ")}` : "";
    })
    .filter(Boolean);
}

export function humanizeText(value: string): string {
  const lines = value
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? "";
    if (tableCells(raw)) {
      const rows: string[][] = [];
      while (index < lines.length && tableCells(lines[index] ?? "")) {
        const cells = tableCells(lines[index] ?? "");
        if (cells) rows.push(cells);
        index++;
      }
      index--;
      output.push(...humanizeTable(rows));
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed || /^(?:---+|\*{3,}|___+)$/u.test(trimmed)) {
      output.push("");
      continue;
    }

    const line = stripInlineMarkdown(
      trimmed
        .replace(/^#{1,6}\s+/u, "")
        .replace(/^[-*+]\s+/u, "• ")
        .replace(/^\d+[.)]\s+/u, "• "),
    );
    if (line) output.push(line);
  }

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanAgentReply(value: string): string {
  return humanizeText(value) || value.trim();
}
