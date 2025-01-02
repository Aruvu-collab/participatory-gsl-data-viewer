import { PUBLIC_SITE_URL } from '$env/static/public';
export const load = async ({ params }) => {
    // read file with slug name
    // const path = `${PUBLIC_SITE_URL}/contents/${params.slug}.json`;
    // console.log(path);
    // const file = await fetch(path).then(res => res.json());
    const file = await import (`../../lib/contents/${params.slug}.json`);
    return {
        slug: params.slug,
        content: JSON.parse(JSON.stringify(file))
    }
}
