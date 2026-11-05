import { expect, it } from "vitest";
import { parseDump } from "./dump-parser";

// Plain lines: a backtick is a backtick, "\\'" is the dump's \' and "\\\\" its \\.
const FIXTURE = [
  "-- phpMyAdmin SQL Dump",
  'SET time_zone = "+00:00";',
  "",
  "CREATE TABLE `sublets` (",
  "  `id` int NOT NULL,",
  "  `description` text",
  ") ENGINE=InnoDB;",
  "",
  "INSERT INTO `sublets` (`id`, `price`, `address`, `description`, `posted_at`, `utility_cost`, `price_negotiable`) VALUES",
  "(1, 950.00, '62, King Street, Burlington', 'Sunny room.\\nTwo roommates, one dog \\'Rex\\'.\\r\\nPath C:\\\\temp 100% \\\"quoted\\\"', '2026-03-21 23:07:23', NULL, 1),",
  "(2, 1250.50, 'O''Brien Lane', 'Literal",
  "newline inside', '2026-10-07 22:43:14', 150.00, 0);",
  "",
  "INSERT INTO `sublet_images` (`id`, `sublet_id`, `image_url`, `sort_order`) VALUES",
  "(10, 1, './public/images/abc.jpg', 0),",
  "(11, 1, './public/images/def.png', 1);",
  "",
  "ALTER TABLE `sublets`",
  "  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=220;",
  "ALTER TABLE `sublet_images`",
  "  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=645;",
  "COMMIT;",
].join("\n");

it("parses tuples, escapes, NULLs, numbers and AUTO_INCREMENT values", () => {
  const d = parseDump(FIXTURE);
  const sublets = d.tables.get("sublets")!;
  expect(sublets).toHaveLength(2);
  expect(sublets[0]).toEqual({
    id: 1,
    price: 950,
    address: "62, King Street, Burlington",
    description: 'Sunny room.\nTwo roommates, one dog \'Rex\'.\r\nPath C:\\temp 100% "quoted"',
    posted_at: "2026-03-21 23:07:23",
    utility_cost: null,
    price_negotiable: 1,
  });
  expect(sublets[1].address).toBe("O'Brien Lane");
  expect(sublets[1].description).toBe("Literal\nnewline inside");
  expect(sublets[1].utility_cost).toBe(150);
  expect(d.tables.get("sublet_images")).toHaveLength(2);
  expect(d.autoIncrement.get("sublets")).toBe(220);
  expect(d.autoIncrement.get("sublet_images")).toBe(645);
});

it("rejects a malformed tuple instead of guessing", () => {
  expect(() => parseDump("INSERT INTO `t` (`a`, `b`) VALUES (1);")).toThrow(/1 values for 2 columns/);
  expect(() => parseDump("INSERT INTO `t` (`a`) VALUES ('open;")).toThrow(/unterminated/);
});
