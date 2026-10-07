// What the extension is currently supposed to hide. The vision check and the
// repair agent both use this, so stats that are out of scope (and so expected
// to be visible) don't count as failures. Update it when the extension's
// scope grows.

export const IN_SCOPE = `The extension must hide these engagement stats:
- Video view counts, on every page: under the video title on the watch page (including the expanded description and its "Video details" list), and on every video card, search result, Shorts card and recommendation (for example "1.2M views", or a bare "1.2M" before the upload date).
- The like count on the watch page's like button (the number next to the thumbs-up icon), and the "Likes" figure in the expanded description.
- The channel's subscriber count under the channel name next to the video on the watch page.`;

export const OUT_OF_SCOPE = `These are NOT hidden yet and are expected to stay visible, so ignore them:
- Subscriber counts anywhere other than under the channel name next to the video (channel pages, search result channel cards, the channel card inside the description).
- Comment counts and like counts on comments.
- Live viewer counts ("watching now").
- Video and channel counts on hashtag and channel pages ("24K videos").
- Numbers that are part of titles, descriptions, comments or thumbnails, video durations, and dates.`;

export const MUST_STAY_VISIBLE = `Everything else must stay visible. In particular: video titles, channel names, upload dates and relative times ("3 years ago"), durations, thumbnails, the like and dislike buttons themselves (icons), Subscribe/Share/Save buttons, descriptions, comments, and navigation.`;
