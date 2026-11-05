// Settings shared by every article in this folder.
module.exports = {
  layout: "post.njk",
  permalink: (data) => `/${data.slug}/`,
};
