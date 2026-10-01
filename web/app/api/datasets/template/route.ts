import { COLUMNS } from "@/lib/surveillance/pipeline";

/** Empty CSV in the weekly surveillance format. */
export async function GET() {
  return new Response(COLUMNS.join(",") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="malaria_surveillance_template.csv"',
    },
  });
}
