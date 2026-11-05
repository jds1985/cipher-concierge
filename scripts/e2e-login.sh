#!/usr/bin/env bash
# E2E against a protected Vercel preview via `vercel curl`. Never prints secrets.
set -u
D="$1"; K="$(cat ${E2E_ADMIN_KEY_FILE:?set E2E_ADMIN_KEY_FILE})"; O="Origin: $D"
J=/tmp/cc_e2e; rm -rf $J; mkdir -p $J; umask 077
pass=0; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 (got $2 want $3)"; fail=$((fail+1)); fi; }
vc(){ vercel curl "$1" --deployment "$D" -- -s "${@:2}" 2>/dev/null; }
code(){ vc "$@" -o /dev/null -w "%{http_code}"; }

ok "GET /login" "$(code /login)" 200
vc /login | grep -q "Hotel sign in" && ok "login page text" 1 1 || ok "login page text" 0 1
ok "/manage no session -> redirect" "$(code /manage)" 307
ok "admin create w/o key" "$(code /api/admin/hotels -X POST -H 'Content-Type: application/json' -d '{"name":"x"}')" 401
TS=$(date +%s)
vc /api/admin/hotels -X POST -H 'Content-Type: application/json' -H "x-admin-key: $K" -d "{\"name\":\"ZZ E2E Test A $TS\",\"managerEmail\":\"e2e-a-$TS@example.com\"}" > $J/a.json
vc /api/admin/hotels -X POST -H 'Content-Type: application/json' -H "x-admin-key: $K" -d "{\"name\":\"ZZ E2E Test B $TS\",\"managerEmail\":\"e2e-b-$TS@example.com\",\"managerPassword\":\"e2e-b-password-$TS\"}" > $J/b.json
AID=$(jq -r .hotelId $J/a.json); BID=$(jq -r .hotelId $J/b.json)
ok "create A with generated password" "$(jq -r .login.generated $J/a.json)" true
ok "create B with set password" "$(jq -r .login.generated $J/b.json)" false
AE=$(jq -r .login.email $J/a.json); AP=$(jq -r .login.password $J/a.json); ATOK=$(jq -r .editToken $J/a.json)
login(){ jq -nc --arg e "$1" --arg p "$2" '{email:$e,password:$p}'; }
ok "login wrong pw" "$(code /api/auth/login -X POST -H 'Content-Type: application/json' -H "$O" -d "$(login $AE wrongpassword123)")" 401
ok "login cross-origin" "$(code /api/auth/login -X POST -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d "$(login $AE $AP)")" 403
vc /api/auth/login -X POST -H 'Content-Type: application/json' -H "$O" -d "$(login $AE $AP)" -D $J/ah -c $J/ca -o /dev/null
grep -qi "^set-cookie: cc_sess=.*HttpOnly.*" $J/ah && grep -qi "secure" $J/ah && ok "cookie HttpOnly+Secure" 1 1 || ok "cookie HttpOnly+Secure" 0 1
ok "/manage with session" "$(code /manage -b $J/ca)" 200
ok "/login with session -> /manage" "$(code /login -b $J/ca)" 307
ok "load via session = A" "$(vc /api/hotel/load -X POST -H 'Content-Type: application/json' -H "$O" -b $J/ca -d '{}' | jq -r .hotel.id)" "$AID"
ok "save via session" "$(code /api/hotel/save -X POST -H 'Content-Type: application/json' -H "$O" -b $J/ca -d "{\"name\":\"ZZ E2E A saved $TS\",\"id\":\"$BID\",\"hotelId\":\"$BID\"}")" 200
ok "qr via session" "$(vc /api/hotel/qr -X POST -H 'Content-Type: application/json' -H "$O" -b $J/ca -d '{"rooms":"101-103"}' | jq '.cards|length')" 3
vc /api/auth/login -X POST -H 'Content-Type: application/json' -H "$O" -d "$(login e2e-b-$TS@example.com e2e-b-password-$TS)" -c $J/cb -o /dev/null
ok "B sees only B" "$(vc /api/hotel/load -X POST -H 'Content-Type: application/json' -H "$O" -b $J/cb -d "{\"id\":\"$AID\"}" | jq -r .hotel.id)" "$BID"
ok "B name untouched by A's spoofed save" "$(vc /api/hotel/load -X POST -H 'Content-Type: application/json' -H "$O" -b $J/cb -d '{}' | jq -r .hotel.name)" "ZZ E2E Test B $TS"
ok "save cross-origin w/ cookie" "$(code /api/hotel/save -X POST -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -b $J/ca -d '{"name":"evil"}')" 403
ok "old /setup/<token> page" "$(code /setup/$ATOK)" 200
ok "token load still works" "$(vc /api/hotel/load -X POST -H 'Content-Type: application/json' -d "{\"token\":\"$ATOK\"}" | jq -r .hotel.name)" "ZZ E2E A saved $TS"
ok "admin reset login w/o key" "$(code /api/admin/hotel-login -X POST -H 'Content-Type: application/json' -d "{\"hotelId\":\"$AID\",\"email\":\"$AE\"}")" 401
ok "admin reset login" "$(code /api/admin/hotel-login -X POST -H 'Content-Type: application/json' -H "x-admin-key: $K" -d "{\"hotelId\":\"$AID\",\"email\":\"$AE\"}")" 200
ok "reset revoked A's session" "$(code /api/hotel/load -X POST -H 'Content-Type: application/json' -H "$O" -b $J/ca -d '{}')" 401
ok "logout" "$(code /api/auth/logout -X POST -H "$O" -b $J/cb)" 200
ok "B session gone after logout" "$(code /api/hotel/load -X POST -H 'Content-Type: application/json' -H "$O" -b $J/cb -d '{}')" 401
last=""; for i in $(seq 1 9); do last=$(code /api/auth/login -X POST -H 'Content-Type: application/json' -H "$O" -d "$(login e2e-b-$TS@example.com bad-pass-$i-xxxx)"); done
ok "rate limit after 8 bad tries" "$last" 429
ok "guest factpack hides manager email" "$(vc "/api/factpack?hotel=$AID" | grep -c "$AE")" 0
echo "E2E: $pass passed, $fail failed. Test hotels: $AID $BID"
rm -rf $J
