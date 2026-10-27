# PoE2 개인 필터 · GitHub에서 관리하고 갱신하기

GitHub 저장소에서 설정과 음원을 관리하고, **GitHub Actions가 시세를 읽어 필터 3종을 생성**합니다. 사용자는 성공한 실행의 ZIP을 받아 게임에 적용합니다. PC에서 PowerShell이나 갱신 프로그램을 실행할 필요가 없습니다. **음원 교체 전에는 PoE2 기본 알림음만 사용합니다.**

저장소는 [gnfpscl2-collab/filtertales](https://github.com/gnfpscl2-collab/filtertales)입니다. 생성 결과 `dist`는 소스에 커밋하지 않고 [Actions 실행 기록](https://github.com/gnfpscl2-collab/filtertales/actions)에서 ZIP으로 내려받습니다. 결과의 `last-update.json`에 기록된 자료 시간을 확인하세요.

## 1. GitHub에서 시작하기

1. [filtertales 저장소](https://github.com/gnfpscl2-collab/filtertales)를 엽니다.
2. 기본 브랜치의 변경은 검사 후 온라인 필터 생성까지 실행합니다. 다른 저장소로 옮길 때는 소스 ZIP 안의 파일과 폴더를 저장소 루트에 업로드하고, 특히 `.github/workflows/update-filters.yml`을 빠뜨리지 마세요. ZIP 파일 자체를 올리면 자동화가 실행되지 않습니다.
3. **Actions** 탭에서 워크플로를 사용할 수 있도록 활성화합니다. 포크한 저장소라면 자동 실행을 별도로 켜야 할 수 있습니다.
4. **Update PoE2 Filters → Run workflow**에서 실행합니다. 기본 리그는 금단 소프트코어 **`Forbidden Rites`**입니다. 다른 리그로 실행할 때는 정확한 영문 리그 이름을 지정합니다.
5. 초록색으로 완료된 실행을 열고 **Artifacts → `poe2-personal-filters`** ZIP을 다운로드합니다. 실패한 실행 대신 마지막으로 성공한 실행의 결과를 사용합니다.

Artifacts를 내려받을 때는 GitHub 로그인이 필요할 수 있습니다. 결과 ZIP은 7일간 보관합니다. 생성 결과를 저장소에 자동 커밋하거나 Releases로 공개하는 기능은 넣지 않았습니다. 워크플로는 소스 읽기 권한으로 실행하며 별도 개인 액세스 토큰이나 PoE 계정 토큰을 요구하지 않습니다.

예약 갱신은 **매시간 17분**에 설정합니다. 스케줄은 기본 브랜치에서 실행되며 GitHub 사정에 따라 지연·누락될 수 있습니다. 공개 저장소는 저장소 활동이 60일 없으면 예약 실행이 중지될 수 있으므로 필요하면 Actions에서 다시 활성화하세요. [GitHub 예약 실행 안내](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [워크플로 활성화 안내](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)

## 2. 게임에 설치하기

1. 다운로드한 결과 ZIP을 풉니다.
2. 게임의 **설정 → 아이템 필터 → 폴더 열기**로 실제 필터 폴더를 엽니다. Windows 기본 위치는 `%USERPROFILE%\Documents\My Games\Path of Exile 2`입니다. 문서 폴더가 이동했다면 게임이 여는 위치를 사용합니다.
3. ZIP 안의 **3개 `.filter` 파일**을 그곳에 복사합니다. 기본 설정에서는 별도 음원이 필요하지 않습니다. `.filter` 파일은 필터 폴더 바로 아래에 둡니다. `onlinefilters` 하위 폴더에 넣지 않습니다. 나중에 커스텀 음원을 켠 결과를 받으면 `sounds` 폴더도 함께 복사합니다.
4. 원하는 필터를 게임에서 선택하고 로드 성공을 확인합니다. 갱신 뒤에도 필터를 재선택하거나 새로고침합니다. 반영되지 않으면 게임을 다시 시작합니다.

GitHub가 새 파일을 만들었다고 게임에 설치된 파일까지 바뀌지는 않습니다. 다운로드·복사·게임 내 재로드는 직접 해야 합니다. 이 설치 방식은 [NeverSink 원본 안내](https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/blob/0.10.4a/README.md)를 따르는 Windows PC용입니다.

## 3. 세 필터의 구간

| 파일 | 일반 장비 아이템 레벨 | 기준 원본 |
| --- | --- | --- |
| `Personal-01-ILvl-1-79.filter` | 1–79 | NeverSink Regular |
| `Personal-02-ILvl-80-81.filter` | 80–81 | NeverSink Semi-Strict |
| `Personal-03-Endgame-ILvl-81plus.filter` | 81 이상 | NeverSink Semi-Strict |

**81은 요청대로 중간용과 엔드게임용에 모두 포함합니다.** 캐릭터 레벨 구간이 아니며 성장에 따라 자동으로 필터가 바뀌지 않습니다. 일반·마법·희귀 무기, 방어구, 장신구 21개 클래스에 범위를 적용합니다. 화폐·서판·경로석·퀘스트·젬·주얼·고유 아이템을 이 구간 때문에 숨기지 않습니다. 범위 안의 장비를 전부 표시하는 기능도 아닙니다. 이후에는 원본 엄격도에 따른 표시·숨김 규칙이 이어집니다.

범위 숨김은 원본 `0800` 구간 뒤, 실제 `0900` 구간 앞에 넣습니다. 앞쪽에서 이미 보호된 특수 베이스·고품질·추가 소켓·특수 상태·제작 베이스·미감정 등급 아이템은 **구간 밖에서도 예외로 표시**됩니다. 원본이 먼저 표시하는 일부 T2 장비도 포함합니다.

**착용 요구 레벨을 직접 검사하는 조건은 현재 공식 필터 문법에 없습니다.** `ItemLevel`은 아이템 레벨, `AreaLevel`은 지역 레벨, `DropLevel`은 베이스의 드롭 시작 레벨입니다. `DropLevel`을 착용 레벨 대신 사용하지 않았습니다. 따라서 아이템 레벨과 착용 요구 레벨을 동시에 제한하는 기능은 제공하지 않습니다. [GGG 공식 조건 문법](https://www.pathofexile.com/item-filter/about)

구간을 바꾸려면 GitHub에서 `config.json`의 `profiles`를 수정합니다. `minItemLevel`은 하한, `maxItemLevel`의 0은 상한 없음을 뜻하며 `sourceMode`는 고정 원본을 고릅니다. 항상 사용할 리그는 `league`를 수정합니다. 하드코어·스탠더드·이벤트는 별도 시장입니다.

## 4. 표시와 효과음

첨부한 표시 기준은 [DISPLAY-POLICY.ko.md](DISPLAY-POLICY.ko.md)에 저장했습니다. **S+ 미러는 빨강·빛기둥, S 중요 화폐는 금색·빛기둥, A 상위 룬·소울코어·표시되는 고유는 보라·미니맵, B 고급 베이스·제작 재료는 파랑·테두리, C 일반 희귀·육성 장비는 원본 표시, D는 원본 숨김**을 기준으로 합니다.

**현재 `config.json`의 `customSounds`는 `false`입니다.** 생성되는 필터에 활성 `CustomAlertSoundOptional` 줄을 넣지 않으며, 설치 ZIP에 대체 WAV를 포함하지 않습니다. 미러·신성한 오브·고가 화폐·카오스·서판·경로석 모두 게임 내장 알림을 사용하고, 특출난 드롭과 미등록 아이템 경고의 기본음도 유지합니다.

아래 배정은 **실제 음원을 교체한 뒤 켤 예정인 설정**입니다. 현재 재생되는 소리가 아닙니다.

| 드롭 조건 | 나중에 사용할 테일즈위버 음원 | 켠 뒤의 결과 경로 |
| --- | --- | --- |
| 검증한 화폐의 개당 가격 ≥1 Divine | 레어 드롭 효과음 | `sounds/tw-rare-drop.wav` |
| Chaos Orb·알려진 일반/마법/희귀 서판 | 레벨업 효과음 | `sounds/tw-level-up.wav` |
| 일반 경로석 T1–T15 | 퀘스트 보상 효과음 | `sounds/tw-quest-reward.wav` |
| 특출난 장비·특수 경로석·새 아이템 경고 | PoE2 기본 필터 알림 | 원본 기본 알림 유지 |

저장소 `assets/sounds`에 남아 있는 세 WAV는 예전에 만든 구분용 대체음이며 실제 테일즈위버 음원이 아닙니다. **현재 필터에서는 사용하지 않습니다.** 나중에 “음원 교체해줘”라고 할 때 Google Drive 공유 링크를 받아 실제 음원으로 바꾸겠습니다. 지금은 Drive 음원을 내려받지 않았습니다.

교체할 때는 `assets/sounds`의 세 파일을 실제 음원으로 바꾼 다음 `config.json`의 **`customSounds`를 `true`로 변경**하고 새 결과를 생성합니다. 기존 대체음이 남아 있는 상태에서 이 설정만 먼저 켜지 마세요. 다시 `false`로 바꾸면 음원 파일이 설치되어 있어도 생성 필터는 PoE2 기본음만 사용합니다.

커스텀 음원을 켠 경우 Divine Orb 자체는 정확히 1 Divine이므로 레어음 대상입니다. Mirror of Kalandra도 별도 고정 보호와 레어음을 사용합니다. 다른 화폐는 원본 S등급 여부와 별개로 채택 가격이 1 Divine 이상인지 검사합니다. 금색 S라는 이유만으로 레어음을 주지 않습니다. 고가 화폐 규칙은 육성 지역을 포함한 모든 지역에 적용합니다. 카오스 가격이 1 Divine 이상이 되면 레벨업음보다 레어음이 우선합니다. **현재 `false` 설정에서도 시각 강조와 가격 판정은 유지하고 소리만 기본음을 사용합니다.**

커스텀 음원을 켜더라도 특출난 장비와 T16·마법 부여·이중 타락 등 특수 경로석은 기본음을 유지합니다. 서판 규칙과 묶인 `Sacred Bloom`에 서판 소리를 적용하지 않습니다. 경로석의 `Continue` 장식 규칙과 분홍색 미등록 경고에도 커스텀 음원을 무차별 적용하지 않습니다. 나머지는 원본 소리 또는 원래의 무알림을 유지합니다.

현재 자동 가격 검증은 **`currency-map.json`의 일반 화폐 28종**입니다. 장비·룬·소울코어·고유 전체의 정확한 판매가를 계산하지 않습니다. 감정 전 옵션과 같은 베이스의 다른 고유를 구분해 모든 고가 아이템을 찾아낸다고 보장할 수 없습니다. 이들의 중요 드롭 보호는 원본 NeverSink 분류를 따릅니다.

커스텀 음원을 켰을 때 사용하는 `CustomAlertSoundOptional`은 파일이 없으면 기본 알림음을 남깁니다. 파일이 있지만 손상되었거나 지원하지 않는 인코딩이면 정상 재생을 보장하지 못합니다. 같은 이름의 정상 WAV로 교체하면 경로를 유지할 수 있습니다. MP3를 사용하려면 필터 경로도 수정해야 하며 확장자만 바꿔 변환하지 않습니다. [공식 음원 문법](https://poe.kakaogames.com/item-filter/about)

GitHub에서 실제 음원으로 교체하고 기능을 켠 뒤에는 새 결과 ZIP의 음원도 게임 폴더에 복사해야 합니다. 게임 폴더의 개인 음원을 보존할 때는 파일을 확인해 선택해서 복사하세요. Drive URL을 게임에서 직접 재생하지 않습니다. 빛기둥·아이콘은 게임 내장 효과이며 외부 영상·이미지·파티클을 불러오지 않습니다.

## 5. 시세 데이터와 실패 처리

공식 공개 주소 `https://web.poecdn.com/api/currency-exchange/poe2/<UTC 시간의 Unix timestamp>`의 **완료된 최근 3개 UTC 시간**을 조회합니다. 현재 진행 중인 시간이나 실시간 주문장·호가는 제공되지 않습니다. 실행당 요청은 최대 3회이며 PoE 로그인·OAuth·POESESSID를 요구하지 않습니다. [공식 Currency Exchange 문서](https://www.pathofexile.com/developer/docs/reference#currencyexchange)

`volume_traded`는 거래 건수가 아니라 거래된 화폐 수량입니다. Divine 직접 쌍의 수량 비율을 우선하고, 없으면 같은 시간 Exalted/Divine 쌍으로 환산합니다. 다른 리그나 시간의 환율을 섞지 않습니다. 최소 2개 시간의 관측, 합산 대상 화폐 수량 10개 이상, 1 Divine 상당 이상의 합산 거래 규모가 필요하며 시간별 단가의 최대/최소가 3배를 넘으면 제외합니다. 통과한 수량의 합계 비율로 개당 가격을 추정합니다. 이 기준은 모든 시세 조작이나 급변을 판별하지는 못합니다.

원본 일반 화폐의 S/A/B는 최소 표시 단계입니다. 개당 1 Divine 이상 S, 0.1 이상 A, 0.01 이상 B로 필요한 승격만 추가하며 가격 때문에 숨김을 추가하지 않습니다. 일반 장비 구간의 숨김은 사용자가 지정한 별도 정책입니다.

HTTP 오류·429·리그 불일치·구조 변경·평가 자료 부족이면 실행을 실패 처리합니다. 자동으로 오프라인 기본 결과를 대신 배포하지 않으며 성공한 실행만 새 온라인 결과 Artifact를 만듭니다. 기존 다운로드나 마지막 성공 결과는 그대로 사용할 수 있지만 그 시세는 오래됐을 수 있습니다. Artifact 보존 기간이 지나면 다시 성공한 실행이 필요합니다.

`last-update.json`에는 생성 시각, 리그, 사용한 시간 구간, 계산 방식과 채택 가격을 기록합니다. 생성 시각은 시세 자료의 시각과 다릅니다. 결과를 적용하기 전에 이 기록을 확인하세요.

## 6. 구성과 유지보수

| 위치 | 역할 |
| --- | --- |
| `.github/workflows/update-filters.yml` | 검사·예약/수동 생성·결과 ZIP 보관 |
| `src/filter.mjs` | 표시·레벨 구간·음원 규칙 생성 |
| `src/economy.mjs` | 공식 시간별 자료 검증과 가격 계산 |
| `src/update.mjs` | 원본 무결성 확인과 결과 생성 |
| `config.json`, `currency-map.json` | 리그·구간·원본 고정 정보와 검증 화폐 목록 |
| `upstream` | 고정 NeverSink 원본 2종 |
| `assets/sounds` | 나중에 실제 음원으로 교체할 파일 3개; 현재 비활성 |
| `test` | 게임 외부에서 실행하는 자동 검사 |
| `dist` | 생성 결과 3종·자료 기록; 음원을 켠 경우에만 음원 포함 |

원본은 [NeverSink PoE2 0.10.4a](https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/releases/tag/0.10.4a), 커밋 `1fc5b3ab99644388263fc991f832d9fac24a1f5d`에 고정합니다. 원본 내부 버전 주석 `0.10.4`는 그대로 보존했습니다. SHA-256이 설정과 다르면 생성을 거부합니다. 해시를 임의로 바꿔 오류를 무시하지 마세요. [원본 MIT 라이선스](https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/blob/0.10.4a/LICENSE)와 크레딧을 보존합니다. GGG·NeverSink·FilterBlade와 제휴하거나 공식 승인을 받은 제품이 아닙니다.

새 리그에서는 정확한 `league`를 바꾸고 수동 실행합니다. 0.5 계열 이후 큰 패치에서 새 아이템·조건·이름이 바뀌면 원본과 매핑도 별도로 검토해야 합니다. 시세 갱신이 원본 문법과 아이템 목록을 최신화하지는 않으며 모든 후속 패치의 호환성을 보장하지 않습니다.

검사는 모든 push/PR에서 실행합니다. PR과 기본 브랜치가 아닌 브랜치에서는 오프라인 생성만 검증하고, 기본 브랜치의 push·예약·수동 실행에서는 온라인 결과를 생성합니다. 검사 결과는 실행할 때 출력하며 GitHub Actions에서의 실제 실행 여부는 해당 저장소의 Actions 기록으로 확인합니다.

로컬에서 코드를 확인하고 싶을 때만 Node.js 24 이상으로 다음을 실행할 수 있습니다. 일반 설치·갱신에는 필요하지 않습니다.

```text
node --test
node src/update.mjs --offline
node src/update.mjs
```

`--offline`은 마지막 시세를 유지하는 모드가 아닙니다. 가격 규칙 없이 고정 보호·구간·지정 소리를 적용한 기본 결과를 생성합니다. 온라인 실패 때 자동 전환하지 않습니다. 생성된 `.filter`를 직접 수정하면 다음 생성에서 바뀌므로 지속할 설정은 저장소 원본을 수정하세요.

생략한 범위: 착용 요구 레벨·전체 아이템 가격 판정·게임 입력/재로드 자동화·원본 자동 버전 전환.
미확인·위험: 실제 게임의 로드·음원 재생, 시세 지연·자료 부족과 향후 패치 호환성. 원격 생성의 상태는 Actions 기록을 확인하세요.
