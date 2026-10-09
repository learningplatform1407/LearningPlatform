from enum import StrEnum


class FeedCategory(StrEnum):
    """What kind of announcement a post is.

    Narrower than the original FEED-1 epic, which specified news/exam/
    livestream. `exam` turned out to be a tag on content that already lives in
    the Exam Hub rather than a kind of announcement, and `livestream` was too
    specific: the same post shape carries a livestream link, an Instagram post
    or any other social URL. An *embedded* player is deliberately out of scope
    -- MEDIA plus a URL in the body is the seam that makes it additive later.
    """

    NEWS = "news"
    MEDIA = "media"


FEED_IMAGES_BUCKET = "feed-images"

# Matches MAX_AVATAR_BYTES on both clients. Enforced three times over, and the
# duplication is deliberate: the clients check first so the user gets an error
# without waiting for an upload, this value backs the 422 on the endpoint that
# mints the upload token, and the bucket itself carries a file_size_limit --
# which is the only one of the three that a client holding a signed upload URL
# cannot route around.
MAX_FEED_IMAGE_BYTES = 5 * 1024 * 1024

# The server picks the extension from the declared mime type rather than
# trusting a client-supplied filename, so a path can never carry an extension
# we did not choose.
ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

# Every image we mint lands directly under this prefix. _validate_image_path
# pins incoming paths to it, so a post cannot reference an arbitrary key.
FEED_IMAGE_PREFIX = "feed"

DEFAULT_FEED_LIMIT = 50
MAX_FEED_LIMIT = 200
