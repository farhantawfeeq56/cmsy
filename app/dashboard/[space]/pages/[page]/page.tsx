import { notFound } from "next/navigation";
import { getPage, getSpace, listComponents, pageHtml } from "@/db";
import { PageEditor } from "./editor";

/**
 * The Page editor: one document per page, deliberately without any design
 * controls. Components are inserted as blocks and are edited only in Design.
 */
export default async function PageEditorPage(props: PageProps<"/dashboard/[space]/pages/[page]">) {
  const { space: slug, page: pageSlug } = await props.params;

  const space = await getSpace(slug);
  if (!space) notFound();

  const [page, components] = await Promise.all([
    getPage(space.id, pageSlug),
    listComponents(space.id),
  ]);
  if (!page) notFound();

  return (
    <PageEditor
      space={{ slug: space.slug, name: space.name }}
      page={{ id: page.id, title: page.title, html: pageHtml(page.blocks) }}
      components={components.map((component) => ({ id: component.id, name: component.name }))}
    />
  );
}
