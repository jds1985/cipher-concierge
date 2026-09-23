// Grab both slugs from the dynamic route
const { hotelId, roomId } = router.query;

// Inside handleSend:
const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    hotelId: hotelId || "the-oliver",
    roomId: roomId || "Guest Suite",
    messages: updatedMessages,
  }),
});
