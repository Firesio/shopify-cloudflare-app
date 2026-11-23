import { CmsList, cmsListMeta } from "@firesio/app/ui/cms";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { identity } from "~/core/identity";
import { firesio } from "~/firesio.server";
import { blogLabelsOf } from "~/i18n/labels";

/** `/blogs`: the published posts, newest first (`?cursor=` for older ones), rendered on the server for search engines. */
export const loader = async (args: LoaderFunctionArgs) => {
  const { i18n } = firesio.services();
  const labels = blogLabelsOf(i18n.translator(firesio.addressLanguage(args.request)), { app: identity.name });
  return { list: await firesio.cms.list(args, "blogs"), labels };
};

export const headers: HeadersFunction = () => firesio.cms.headers;

export const meta: MetaFunction<typeof loader> = ({ data }) =>
  data === undefined ? [] : cmsListMeta(data.list, { siteName: identity.name, listName: data.labels.heading, description: data.labels.description });

export default function BlogList() {
  const { list, labels } = useLoaderData<typeof loader>();
  return (
    <section className="section">
      <CmsList view={list} heading={labels.heading} moreLabel={labels.more} emptyLabel={labels.empty} />
    </section>
  );
}
