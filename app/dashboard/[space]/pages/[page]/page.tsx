import { notFound } from "next/navigation";
import { getPage, getSpace, listComponents, pageDoc } from "@/db";
import { parseProps, parseTemplate } from "@/db/component-template";
import { PageEditor } from "./editor";

/**
 * The Page editor: a page is blocks, deliberately without any design controls.
 * Components are inserted as blocks and are edited only in Design.
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
      page={{ id: page.id, title: page.title, doc: pageDoc(page.blocks) }}
      // What each component declares travels with it, so the inspector reads
      // the declared props rather than guessing them from the name.
      components={components.map((component) => ({
        id: component.id,
        name: component.name,
        props: parseProps(component.props),
        template: parseTemplate(component.template),
      }))}
    />
  );
}
