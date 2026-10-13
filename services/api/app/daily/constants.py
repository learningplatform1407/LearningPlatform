"""Bounds for the question of the day.

There is no status or kind enum here, unlike flashcards and the feed: a day
either has a question or it does not, and the interesting state (answered,
answerable) is per-caller rather than stored on the row.
"""

# The widest span a single calendar request may cover. A quarter is more than
# any month view needs and keeps the query bounded -- the endpoint takes an
# arbitrary range, so without a cap a caller could ask for a decade.
MAX_CALENDAR_SPAN_DAYS = 92
