# Test set run: offline-reload (2026-10-22T01:31:16.166Z)

Overall: **99/99** pass. Facts engine: 87/87. Open questions (safe = Cipher answer passed guard, or graceful fallback): 12/12.
Cipher actually answered (guard passed) on 1/12 open questions. Read those answers below; the guard doesn't judge quality.

| hotel | id | pass | source | intent | ms | notes |
|---|---|---|---|---|---|---|
| the-oliver | checkout-1 | ✅ | facts | checkout | 2 |  |
| the-oliver | checkout-2 | ✅ | facts | checkout | 0 |  |
| the-oliver | checkout-3 | ✅ | facts | checkout | 1 |  |
| the-oliver | late-checkout-1 | ✅ | facts | late_checkout | 0 |  |
| the-oliver | late-checkout-2 | ✅ | facts | late_checkout | 0 |  |
| the-oliver | checkin-1 | ✅ | facts | checkin | 0 |  |
| the-oliver | early-checkin | ✅ | facts | early_checkin | 0 |  |
| the-oliver | wifi-1 | ✅ | facts | wifi | 0 |  |
| the-oliver | wifi-2 | ✅ | facts | wifi | 1 |  |
| the-oliver | wifi-3 | ✅ | facts | wifi | 0 |  |
| the-oliver | breakfast-1 | ✅ | facts | breakfast | 0 |  |
| the-oliver | breakfast-2 | ✅ | facts | breakfast | 0 |  |
| the-oliver | dining-1 | ✅ | facts | dining | 18 |  |
| the-oliver | dining-2 | ✅ | facts | dining | 1 |  |
| the-oliver | late-food-1 | ✅ | facts | late_food | 0 |  |
| the-oliver | late-food-2 | ✅ | facts | late_food | 1 |  |
| the-oliver | late-food-3 | ✅ | facts | late_food | 0 |  |
| the-oliver | room-service | ✅ | facts | room_service | 0 |  |
| the-oliver | parking-1 | ✅ | facts | parking | 0 |  |
| the-oliver | parking-2 | ✅ | facts | parking | 0 |  |
| the-oliver | pool | ✅ | facts | pool | 0 |  |
| the-oliver | gym | ✅ | facts | gym | 1 |  |
| the-oliver | towels-1 | ✅ | facts | housekeeping | 0 |  |
| the-oliver | towels-2 | ✅ | facts | housekeeping | 0 |  |
| the-oliver | housekeeping | ✅ | facts | housekeeping | 0 |  |
| the-oliver | front-desk-1 | ✅ | facts | front_desk | 0 |  |
| the-oliver | front-desk-2 | ✅ | facts | front_desk | 0 |  |
| the-oliver | locked-out | ✅ | facts | locked_out | 0 |  |
| the-oliver | keycard | ✅ | facts | locked_out | 1 |  |
| the-oliver | noise | ✅ | facts | noise | 1 |  |
| the-oliver | emergency | ✅ | facts | emergency | 0 |  |
| the-oliver | medical | ✅ | facts | emergency | 0 |  |
| the-oliver | directions | ✅ | facts | directions | 0 |  |
| the-oliver | local-recs | ✅ | facts | local_recs | 0 |  |
| the-oliver | amenities | ✅ | facts | amenities | 0 |  |
| the-oliver | pets | ✅ | facts | pets | 1 |  |
| the-oliver | smoking | ✅ | facts | smoking | 0 |  |
| the-oliver | unknown-spa | ✅ | facts | unknown_hotel_question | 1 |  |
| the-oliver | unknown-shuttle | ✅ | facts | directions | 0 |  |
| the-oliver | unknown-laundry | ✅ | facts | unknown_hotel_question | 1 |  |
| the-oliver | thanks | ✅ | facts | thanks | 0 |  |
| the-oliver | open-1 | ✅ | cipher | cipher | 480 |  |
| the-oliver | open-2 | ✅ | cipher-fallback | cipher_unfinished | 563 |  |
| the-oliver | open-3 | ✅ | cipher-fallback | cipher_meta | 517 |  |
| the-oliver | food-asian-jim | ✅ | facts | local_recs | 1 |  |
| the-oliver | food-sushi | ✅ | facts | local_recs | 0 |  |
| the-oliver | food-mexican | ✅ | facts | local_recs | 0 |  |
| the-oliver | food-indian-none | ✅ | facts | local_recs | 0 |  |
| the-oliver | food-plain | ✅ | facts | local_recs | 0 |  |
| the-oliver | open-4 | ✅ | cipher-fallback | cipher_unfinished | 602 |  |
| the-oliver | open-5 | ✅ | cipher-fallback | cipher_off-topic | 552 |  |
| the-oliver | open-6 | ✅ | cipher-fallback | cipher_not-prose | 564 |  |
| the-tennessean | checkout-1 | ✅ | facts | checkout | 0 |  |
| the-tennessean | checkout-2 | ✅ | facts | checkout | 0 |  |
| the-tennessean | checkout-3 | ✅ | facts | checkout | 0 |  |
| the-tennessean | late-checkout-1 | ✅ | facts | late_checkout | 0 |  |
| the-tennessean | late-checkout-2 | ✅ | facts | late_checkout | 0 |  |
| the-tennessean | checkin-1 | ✅ | facts | checkin | 0 |  |
| the-tennessean | early-checkin | ✅ | facts | early_checkin | 0 |  |
| the-tennessean | wifi-1 | ✅ | facts | wifi | 0 |  |
| the-tennessean | wifi-2 | ✅ | facts | wifi | 0 |  |
| the-tennessean | wifi-3 | ✅ | facts | wifi | 1 |  |
| the-tennessean | breakfast-1 | ✅ | facts | breakfast | 0 |  |
| the-tennessean | breakfast-2 | ✅ | facts | breakfast | 0 |  |
| the-tennessean | dining-1 | ✅ | facts | dining | 1 |  |
| the-tennessean | dining-2 | ✅ | facts | dining | 0 |  |
| the-tennessean | late-food-1 | ✅ | facts | late_food | 0 |  |
| the-tennessean | late-food-2 | ✅ | facts | late_food | 0 |  |
| the-tennessean | late-food-3 | ✅ | facts | late_food | 1 |  |
| the-tennessean | room-service | ✅ | facts | room_service | 0 |  |
| the-tennessean | parking-1 | ✅ | facts | parking | 0 |  |
| the-tennessean | parking-2 | ✅ | facts | parking | 0 |  |
| the-tennessean | pool | ✅ | facts | pool | 0 |  |
| the-tennessean | gym | ✅ | facts | gym | 0 |  |
| the-tennessean | towels-1 | ✅ | facts | housekeeping | 0 |  |
| the-tennessean | towels-2 | ✅ | facts | housekeeping | 0 |  |
| the-tennessean | housekeeping | ✅ | facts | housekeeping | 0 |  |
| the-tennessean | front-desk-1 | ✅ | facts | front_desk | 0 |  |
| the-tennessean | front-desk-2 | ✅ | facts | front_desk | 0 |  |
| the-tennessean | locked-out | ✅ | facts | locked_out | 0 |  |
| the-tennessean | keycard | ✅ | facts | locked_out | 0 |  |
| the-tennessean | noise | ✅ | facts | noise | 0 |  |
| the-tennessean | emergency | ✅ | facts | emergency | 0 |  |
| the-tennessean | medical | ✅ | facts | emergency | 0 |  |
| the-tennessean | directions | ✅ | facts | directions | 0 |  |
| the-tennessean | local-recs | ✅ | facts | local_recs | 0 |  |
| the-tennessean | amenities | ✅ | facts | amenities | 0 |  |
| the-tennessean | pets | ✅ | facts | pets | 0 |  |
| the-tennessean | smoking | ✅ | facts | smoking | 0 |  |
| the-tennessean | unknown-spa | ✅ | facts | unknown_hotel_question | 1 |  |
| the-tennessean | unknown-shuttle | ✅ | facts | directions | 0 |  |
| the-tennessean | unknown-laundry | ✅ | facts | unknown_hotel_question | 0 |  |
| the-tennessean | thanks | ✅ | facts | thanks | 0 |  |
| the-tennessean | open-1 | ✅ | cipher-fallback | cipher_unverified-name | 460 |  |
| the-tennessean | open-2 | ✅ | cipher-fallback | cipher_unfinished | 465 |  |
| the-tennessean | open-3 | ✅ | cipher-fallback | cipher_meta | 426 |  |
| the-tennessean | open-4 | ✅ | cipher-fallback | cipher_unverified-claim | 387 |  |
| the-tennessean | open-5 | ✅ | cipher-fallback | cipher_ungrounded | 347 |  |
| the-tennessean | open-6 | ✅ | cipher-fallback | cipher_off-topic | 456 |  |

## Open-question answers (for human review)

- **the-oliver / Tell me a fun fact about Knoxville** → (cipher) The Oliver Hotel is on Market Square in Knoxville, TN.
- **the-oliver / What should I pack for a hike in the Smokies?** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone, or call **(865) 521-0050**.
- **the-oliver / How do you say thank you in Spanish?** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone, or call **(865) 521-0050**.
- **the-oliver / What should I do on a rainy afternoon?** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone, or call **(865) 521-0050**.
- **the-oliver / Any ideas for a romantic evening?** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone, or call **(865) 521-0050**.
- **the-oliver / Write me a poem about my stay** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone, or call **(865) 521-0050**.
- **the-tennessean / Tell me a fun fact about Knoxville** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone.
- **the-tennessean / What should I pack for a hike in the Smokies?** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone.
- **the-tennessean / How do you say thank you in Spanish?** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone.
- **the-tennessean / What should I do on a rainy afternoon?** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone.
- **the-tennessean / Any ideas for a romantic evening?** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone.
- **the-tennessean / Write me a poem about my stay** → (cipher-fallback) I'm not certain about that. Let me connect you to the front desk. They can help with that: Dial 0 from your room phone.
