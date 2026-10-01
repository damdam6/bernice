# 전체 팀원 등록 (#190)

- 진입: 시트 관리 → 전체 팀원 관리 (`/admin/roster`). 회차가 없어도 등록 가능하다.
- `POST /api/admin/roster`에 `{ "name": "이름" }`을 보낸다. 기존 관리자 미들웨어로 인증한다.
- 이름은 필수, 100자 이하, 한 줄. 앞뒤 공백 제거 및 NFC 정규화 후 기존 명단 전체와 대조한다. 탈퇴자·상태 오류 행의 이름도 중복 검사에 포함한다.
- 현재 회차 파서는 이름으로 선수를 연결하므로 동명이인은 구분 가능한 이름을 사용해야 한다.
- 신규 팀원은 `활동` 상태로 명단 마지막 데이터 행 다음에 추가한다. 빈 행을 재사용하거나 기존 행을 이동하지 않는다. 기존 행 기반 선수 ID를 보존한다.
- 회차 탭은 수정하지 않는다. 등록 후 `참가자 추가`에서 회차를 선택해 별도로 참여시킨다.
- 이름은 `stringValue`로 저장해 `=`로 시작해도 수식으로 실행하지 않는다.
- 동시 동일 이름 등록은 정규화 이름의 SHA-256으로 만든 `bernice_member_<hash>` named range ID를 예약하고 `appendCells`와 같은 원자적 batchUpdate에 넣어 막는다. 이 범위는 명단 전체를 가리키는 중복 방지 메타데이터이며 선수 ID가 아니다. 추가 인프라나 기존 데이터 이전은 필요 없다.
- 예약 범위는 지우지 않는다. 시트에서 직접 이름을 바꾸거나 명단을 삭제하는 작업은 이 API의 범위 밖이며, 해당 이름 예약은 남는다. 향후 이름 변경 기능을 만들면 예약 관리도 함께 구현해야 한다. 외부 직접 편집과 앱 등록 사이의 동시성은 보장하지 않는다.
- 비멱등 append 요청은 자동 재시도하지 않는다. 실패/응답 유실 시 최신 명단을 다시 확인하고, 이미 존재하면 409로 안내한다. 이때도 서버 캐시를 비운다.
- 성공 201, 입력 오류 400, 이름 중복 409, 저장/조회 실패 502. 성공 시 서버 records 캐시와 클라이언트 records 쿼리를 무효화한다. 실패 화면은 입력을 유지하고 명단 새로 고침을 제공한다.

검증: API 테스트(행/ID 보존, 정규화, 중복, 수식 리터럴, 실패, 별도 회차 선택) 및 UI 테스트(회차 없이 등록, 목록 갱신, 실패 입력 유지, 제출 중 중복 클릭 방지).

Google API 계약: [AddNamedRangeRequest](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#addnamedrangerequest), [batchUpdate 원자성](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate).
