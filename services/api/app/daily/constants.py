"""Bounds for the question of the day.

There is no status or kind enum here, unlike flashcards and the feed: a day
either has a question or it does not, and the interesting state (answered,
answerable) is per-caller rather than stored on the row.
"""

# The widest span a single calendar request may cover. A quarter is more than
# any month view needs and keeps the query bounded -- the endpoint takes an
# arbitrary range, so without a cap a caller could ask for a decade.
#
# A month grid is six weeks, 42 days, because it pads to whole weeks -- that is
# what a client must fetch to cover every cell it renders, and it fits here
# with room to spare.
MAX_CALENDAR_SPAN_DAYS = 92

# How far ahead the admin console plans. Sent to the client in the admin
# response rather than hard-coded there as well, so the window the page draws
# cannot disagree with the window the endpoint returns.
ADMIN_HORIZON_DAYS = 14

# How far ahead a day may be booked at all. The console offers the horizon
# above, but the endpoint is reachable directly, and a row booked years out
# would be unreachable by any UI -- invisible until that date arrived.
MAX_BOOKING_DAYS = 92
