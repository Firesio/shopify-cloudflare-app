import { localeIn } from "@firesio/app";
import { CmsArticle, cmsMeta } from "@firesio/app/ui/cms";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { identity } from "~/core/identity";
import { firesio } from "~/firesio.server";
import { blogLabelsOf } from "~/i18n/labels";

/** `/blogs/:slug`: one post. A moved address answers 301, an unknown one 404, one taken down 410 (`firesio.cms.page` throws them). */
export const loader = async (args: LoaderFunctionArgs) => {
  const { i18n } = firesio.services();
  const labels = blogLabelsOf(i18n.translator(localeIn(i18n)(args.request)), { app: identity.name });
  return { page: await firesio.cms.page(args), labels };
};

export const headers: HeadersFunction = () => firesio.cms.headers;

export const meta: MetaFunction<typeof loader> = ({ data }) => (data === undefined ? [] : cmsMeta(data.page, { siteName: identity.name, listName: data.labels.heading }));

export default function BlogPost() {
  const { page, labels } = useLoaderData<typeof loader>();
  return (
    <section className="section">
      <CmsArticle view={page} footer={<Link className="cms-article__back" to="/blogs">{labels.back}</Link>} />
    </section>
  );
}
