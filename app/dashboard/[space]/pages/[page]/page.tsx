import { notFound } from "next/navigation";
import { getPage, getSpace, pageDoc } from "@/db";
import { PageEditor } from "./editor";

/**
 * The Page editor: a page is blocks, deliberately without any design controls.
 * There are no block types yet, so this is the editor with its blocks taken
 * out; the stored body still travels with the page and is never rewritten.
 */
export default async function PageEditorPage(props: PageProps<"/dashboard/[space]/pages/[page]">) {
  const { space: slug, page: pageSlug } = await props.params;

  const space = await getSpace(slug);
  if (!space) notFound();

  const page = await getPage(space.id, pageSlug);
  if (!page) notFound();

  return (
    <PageEditor
      space={{ slug: space.slug, name: space.name }}
      page={{ id: page.id, title: page.title, doc: pageDoc(page.blocks) }}
    />
  );
}
