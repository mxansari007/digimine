/**
 * Downloadable JSON template for a Product (downloadable resource, eBook,
 * mock-pack, etc.). Mirrors the Product type in @digimine/types. Body
 * `description` is HTML so it pastes straight into the TipTap editor.
 */
export const PRODUCT_JSON_TEMPLATE = JSON.stringify(
    {
        name: "React Interview Questions — Top 100 PDF",
        slug: "react-interview-questions-top-100",
        description:
            "<p>A curated collection of the <strong>top 100 React interview questions</strong>, grouped by topic, with concise answers and code examples.</p>" +
            "<h2>What's inside</h2>" +
            "<ul><li>Hooks, lifecycle, performance</li><li>State management patterns</li><li>Testing and debugging tips</li></ul>" +
            "<h2>Coverage at a glance</h2>" +
            "<table class=\"md-table\">" +
            "<thead><tr><th>Topic</th><th data-align=\"right\">Questions</th><th>Level</th></tr></thead>" +
            "<tbody>" +
            "<tr><td>React Hooks</td><td data-align=\"right\">22</td><td>Beginner → Mid</td></tr>" +
            "<tr><td>Performance & Profiling</td><td data-align=\"right\">14</td><td>Mid → Senior</td></tr>" +
            "<tr><td>State Management</td><td data-align=\"right\">18</td><td>Mid</td></tr>" +
            "<tr><td>Testing & DX</td><td data-align=\"right\">16</td><td>Mid</td></tr>" +
            "<tr><td>SSR / Next.js</td><td data-align=\"right\">30</td><td>Mid → Senior</td></tr>" +
            "</tbody></table>" +
            "<blockquote>This field is HTML — use any tags you like (tables, callouts, code blocks, figures).</blockquote>",
        shortDescription: "Top 100 React interview Q&A — free PDF for freshers and experienced devs.",
        price: 0,
        compareAtPrice: 50,
        type: "resource",
        purchaseType: "downloadable",
        status: "published",
        thumbnailURL: "",
        images: [],
        files: [],
        contentPreview: [
            { name: "Sample chapter — Hooks", type: "file" },
            { name: "Index", type: "file" },
        ],
        tags: ["react", "interview", "pdf"],
        highlights: ["100 curated questions", "Topic-wise grouping", "Free download"],
        deliveryFormat: "online",
        moneyBackGuarantee: 0,
        instantAccess: true,
    },
    null,
    2
);

export function downloadProductTemplate(filename = "product-template.json") {
    if (typeof window === "undefined") return;
    const blob = new Blob([PRODUCT_JSON_TEMPLATE], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
