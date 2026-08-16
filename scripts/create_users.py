#!/usr/bin/env python3
"""
구성원(members.email) 기준으로 Supabase Auth 로그인 계정을 만들고, 초기 비밀번호를 발급/초기화한다.
Google 로그인 없이 "지정한 이메일 + 비밀번호" 로만 로그인하게 할 때 사용.

필요한 것 (환경변수 또는 옵션):
  SUPABASE_URL              예: https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY Project Settings → API → service_role (secret)  ← 절대 git/웹에 넣지 말 것

사용법:
  # 1) (선택) 이름→이메일 CSV 로 members.email 채우기  (헤더: name,email)
  python scripts/create_users.py --members-csv local/emails.csv

  # 2) 이메일이 있는 활성 구성원 중 계정이 없는 사람 전부 계정 생성 (초기 비밀번호 자동 발급)
  python scripts/create_users.py --create-missing --out local/accounts.csv

  # 3) 특정 사용자 비밀번호 초기화
  python scripts/create_users.py --reset kim87@khu.ac.kr            # 무작위 비밀번호 발급
  python scripts/create_users.py --reset kim87@khu.ac.kr --password 새비밀번호

  # 목록만 보기
  python scripts/create_users.py --list

출력되는 초기 비밀번호는 본인에게 안전한 방법으로 전달하고, 로그인 후 '내 계정' 에서 바꾸게 하세요.
"""
import argparse
import csv
import json
import os
import secrets
import string
import sys
import urllib.error
import urllib.request

ALPHABET = string.ascii_letters + string.digits


def gen_password(n=12):
    # 헷갈리는 글자 제외
    pool = ''.join(c for c in ALPHABET if c not in 'O0Il1')
    return ''.join(secrets.choice(pool) for _ in range(n))


class Api:
    def __init__(self, url, key):
        self.url = url.rstrip('/')
        self.key = key

    def _req(self, method, path, body=None, prefer=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method)
        req.add_header('apikey', self.key)
        req.add_header('Authorization', f'Bearer {self.key}')
        req.add_header('Content-Type', 'application/json')
        if prefer:
            req.add_header('Prefer', prefer)
        try:
            with urllib.request.urlopen(req) as r:
                txt = r.read().decode()
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')
            raise SystemExit(f'HTTP {e.code} {method} {path}\n{msg}')

    # --- REST (service_role → RLS 우회) ---
    def members(self):
        return self._req('GET', '/rest/v1/members?select=id,name,email,role,active&order=sort_order,name')

    def set_member_email(self, name, email):
        from urllib.parse import quote
        return self._req('PATCH', f'/rest/v1/members?name=eq.{quote(name)}', {'email': email}, prefer='return=representation')

    # --- Auth admin ---
    def auth_users(self):
        users, page = [], 1
        while True:
            r = self._req('GET', f'/auth/v1/admin/users?page={page}&per_page=1000')
            batch = r.get('users', r if isinstance(r, list) else [])
            users.extend(batch)
            if len(batch) < 1000:
                break
            page += 1
        return users

    def create_user(self, email, password, name):
        return self._req('POST', '/auth/v1/admin/users', {
            'email': email, 'password': password, 'email_confirm': True,
            'user_metadata': {'name': name},
        })

    def set_password(self, user_id, password):
        return self._req('PUT', f'/auth/v1/admin/users/{user_id}', {'password': password})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--url', default=os.environ.get('SUPABASE_URL'))
    ap.add_argument('--key', default=os.environ.get('SUPABASE_SERVICE_ROLE_KEY'))
    ap.add_argument('--members-csv', help='name,email CSV 로 members.email 채우기')
    ap.add_argument('--create-missing', action='store_true', help='계정 없는 활성 구성원 계정 생성')
    ap.add_argument('--reset', metavar='EMAIL', help='해당 이메일 비밀번호 초기화')
    ap.add_argument('--password', help='--reset 시 지정 비밀번호 (없으면 무작위)')
    ap.add_argument('--list', action='store_true', help='구성원/계정 현황 출력')
    ap.add_argument('--out', help='발급한 계정/비밀번호를 저장할 CSV (local/ 아래 권장)')
    args = ap.parse_args()

    if not args.url or not args.key:
        sys.exit('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (환경변수 또는 --url/--key).')
    if not args.key.startswith(('eyJ', 'sb_secret_')):
        print('경고: service_role(secret) 키가 아닌 것 같습니다. anon/publishable 키로는 계정을 만들 수 없습니다.', file=sys.stderr)
    api = Api(args.url, args.key)

    if args.members_csv:
        n = 0
        with open(args.members_csv, encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                name, email = (row.get('name') or '').strip(), (row.get('email') or '').strip().lower()
                if not name or not email:
                    continue
                r = api.set_member_email(name, email)
                if r:
                    n += 1
                    print(f'  {name} → {email}')
                else:
                    print(f'  (이름 없음) {name}', file=sys.stderr)
        print(f'members.email 갱신 {n}명')

    members = api.members()
    users = api.auth_users()
    by_email = {u['email'].lower(): u for u in users if u.get('email')}
    issued = []

    if args.list or not (args.members_csv or args.create_missing or args.reset):
        print(f'{"이름":8s} {"역할":8s} {"활성":4s} {"이메일":32s} 계정')
        for m in members:
            e = (m.get('email') or '').lower()
            print(f'{m["name"]:8s} {m["role"]:8s} {"O" if m["active"] else "X":4s} {e or "(없음)":32s} {"있음" if e in by_email else "없음"}')
        print(f'\nAuth 계정 {len(users)}개, 구성원 {len(members)}명')

    if args.create_missing:
        for m in members:
            e = (m.get('email') or '').strip().lower()
            if not e or not m['active'] or e in by_email:
                continue
            pw = gen_password()
            api.create_user(e, pw, m['name'])
            issued.append((m['name'], e, pw))
            print(f'  생성: {m["name"]} {e}')
        print(f'계정 생성 {len(issued)}개')

    if args.reset:
        e = args.reset.strip().lower()
        u = by_email.get(e)
        if not u:
            sys.exit(f'계정 없음: {e}  (--create-missing 으로 먼저 만드세요)')
        pw = args.password or gen_password()
        api.set_password(u['id'], pw)
        name = next((m['name'] for m in members if (m.get('email') or '').lower() == e), '')
        issued.append((name, e, pw))
        print(f'  비밀번호 초기화: {e}')

    if issued:
        print('\n이름,이메일,초기비밀번호')
        for row in issued:
            print(','.join(row))
        if args.out:
            os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
            with open(args.out, 'a', encoding='utf-8-sig', newline='') as f:
                w = csv.writer(f)
                for row in issued:
                    w.writerow(row)
            print(f'→ {args.out} 에 추가 저장됨 (급여 못지않게 민감한 파일입니다. 전달 후 삭제 권장)')


if __name__ == '__main__':
    main()
