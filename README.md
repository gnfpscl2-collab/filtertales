# PoE2 개인 필터 · GitHub 관리와 갱신

[filtertales 저장소](https://github.com/gnfpscl2-collab/filtertales)에서 리그·표시·음원을 관리하고 **GitHub Actions가 시세를 반영해 필터 3종을 생성**합니다. PC에서 PowerShell이나 갱신 프로그램을 실행할 필요가 없습니다.

## 생성 결과 받기와 설치

1. [Actions](https://github.com/gnfpscl2-collab/filtertales/actions)의 **Update PoE2 Filters → Run workflow**에서 실행합니다. 기본 리그는 금단 소프트코어 **Forbidden Rites**이며 다른 리그는 정확한 이름으로 지정합니다.
2. 초록색으로 완료된 실행의 **Artifacts → poe2-personal-filters** ZIP을 받습니다. 로그인이 필요할 수 있고 결과는 7일간 보관됩니다.
3. 게임의 **설정 → 아이템 필터 → 폴더 열기**로 실제 필터 폴더를 엽니다. Windows 기본 위치는 **%USERPROFILE%\Documents\My Games\Path of Exile 2**입니다. 문서 폴더가 이동했다면 게임이 여는 위치를 사용합니다.
4. ZIP의 **.filter 3개와 sounds 폴더**를 복사합니다. .filter는 필터 폴더 바로 아래에 두며 onlinefilters 안에 넣지 않습니다.
5. 원하는 파일을 선택하고 게임에서 다시 불러옵니다. 반영되지 않으면 게임을 다시 시작합니다.

음원이 활성화된 결과 ZIP은 **필터 3개·WAV 6개·홈페이지 등록용 TXT 3개·last-update.json**으로 구성됩니다. 등록용 TXT는 website-sources 폴더에 있으며 해당 .filter와 바이트가 같은 전체 소스입니다. 게임에는 .filter와 sounds만 복사합니다. 보고서의 **CustomSoundsEnabled**, **SoundFiles**, **WebsiteSources**, 자료 시간을 확인하세요. 커스텀 음원을 끈 결과에는 WAV가 없습니다. GitHub가 새 결과를 만들어도 게임 폴더의 파일은 직접 복사·재로드해야 합니다. [NeverSink 설치 안내](https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/blob/0.10.4a/README.md)

기본 브랜치의 변경·수동 실행·**매시간 17분**에 온라인 결과를 생성합니다. PR과 다른 브랜치는 검사와 오프라인 생성만 검증합니다. 예약 실행은 기본 브랜치에서만 동작하고 지연·누락될 수 있습니다. 공개 저장소가 60일간 비활성이면 예약이 중지될 수 있으며 포크도 별도 활성화가 필요할 수 있습니다. [GitHub 예약 실행](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [활성화 안내](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)

## 세 필터와 적용 구간

| 파일 | 권장 캐릭터 레벨 | 일반 장비 아이템 레벨 조건 | 원본 |
| --- | --- | --- | --- |
| tw-normal.filter | 1–65 | 1–65 | NeverSink Regular |
| tw-hard.filter | 65–90 | 79 이상 | NeverSink Semi-Strict |
| tw-hell.filter | 90 이상 | 82 이상 | NeverSink Semi-Strict + 개인 엄격화 |

**골드(Gold)는 tw-hard·tw-hell에서 중첩 수량과 지역 레벨에 관계없이 숨깁니다.** tw-normal은 기존 NeverSink 골드 표시를 유지합니다. 원본 골드 표시 규칙보다 앞에 별도 숨김을 적용합니다.

**권장 캐릭터 레벨과 드롭 아이템 레벨은 서로 다른 기준입니다.** 캐릭터 65와 90은 전환 권장 구간에 겹치며 게임에서 직접 필터를 바꿉니다. 캐릭터 레벨을 직접 검사하거나 자동 전환하는 기능은 없습니다. 실제 일반 장비 조건은 normal 1–65·hard 79 이상·hell 82 이상이며, 82 이상 장비는 hard와 hell 양쪽 범위에 포함합니다.

일반·마법·희귀 무기, 방어구, 장신구 21개 클래스에 아이템 레벨 범위를 적용합니다. 고유·화폐·서판·경로석·퀘스트·젬·주얼은 이 범위 때문에 숨기지 않습니다. 범위 안의 모든 장비를 표시하는 기능도 아니며 이후에는 원본 표시·숨김 정책이 이어집니다. 파일명이 바뀌었으므로 게임에서 새 파일을 선택하세요.

범위 숨김은 원본 **0800** 뒤, 실제 **0900** 앞에 있습니다. 앞쪽의 특수 베이스·고품질·추가 소켓·특수 상태 보호는 구간 밖에서도 작동합니다. 1·2단계는 원본의 제작용·미감정 보호와 일부 T2 예외도 유지합니다. 3단계에는 아래 엄격화 조건을 추가합니다.

**두 번째 필터에 요청한 착용 요구 레벨 65 이상 조건은 미구현입니다.** 착용 요구 레벨을 직접 검사하는 조건이 현재 공식 필터 문법에 없어 아이템 레벨 79 이상만 적용합니다. ItemLevel은 아이템 레벨, AreaLevel은 지역 레벨, DropLevel은 베이스의 드롭 시작 레벨입니다. DropLevel을 착용 레벨 대신 사용하지 않습니다. [GGG 공식 조건](https://www.pathofexile.com/item-filter/about)

구간은 **config.json → profiles**에서 수정합니다. minItemLevel은 하한, maxItemLevel의 0은 상한 없음이며 sourceMode는 고정 원본을 고릅니다. 리그는 league에서 지정하고 하드코어·스탠더드·이벤트 시장을 혼합하지 않습니다.

## hard·hell의 화폐와 재료 기준

**tw-hard는 materialTier: "greater", tw-hell은 materialTier: "greater-exalted"**를 사용합니다. tw-normal의 화폐·재료 표시에는 이 제한을 적용하지 않습니다. 아래 숨김은 정확한 아이템 이름으로 적용하며 수량이 많아도 해제되지 않습니다.

| 품목 예시 | tw-hard | tw-hell |
| --- | --- | --- |
| 제왕의 오브 파편, 일반 제왕·엑잘티드·연금술 오브, 하급 쥬얼러·기본 품질 재료 | 숨김 | 숨김 |
| Greater Regal Orb, Greater Jeweller's Orb, Greater Orb of Augmentation, Greater Orb of Transmutation | 표시 | 숨김 |
| Greater Exalted Orb, Greater Chaos Orb, Chaos Orb | 표시 | 표시 |
| Perfect Regal/Exalted/Chaos/Jeweller's Orb, Divine, Mirror, Hinekora | 표시 | 표시 |
| Perfect Orb of Augmentation, Perfect Orb of Transmutation | 표시 | 숨김 |
| 룬·소울코어 C/D/E·저가 공급, 에센스 C/D/E, 촉매 C, 액체 감정 C/D | 숨김 | 숨김 |

일반 화폐는 원본 S/A/B를 남기고 C/D/E·공급 목록을 숨깁니다. hard는 그 목록 중 **Greater로 시작하는 제작 오브를 예외로 남기며**, hell은 위의 Perfect 진화·확장 오브도 숨깁니다. 고급 S/A/B 재료와 미등록 아이템 경고는 유지하고, 서판·경로석·퀘스트·피나클 열쇠·금화는 이 재료 조건으로 숨기지 않습니다.

**이 기준은 아이템 종류와 NeverSink 고정 등급에 따른 제한이며 Greater Exalted Orb의 실제 시세 이상이라는 뜻은 아닙니다.** 현재 가격 매핑은 기존 29종과 심연 26종을 합한 55종입니다. 검증 단가 **1 Divine 이상인 S+는 재료 숨김보다 먼저 표시하고 0161.wav**를 사용합니다. 그 아래 0.1·0.01 Divine 표시 승격은 재료 숨김을 우회하지 않습니다. 육성 예외도 이 이름 목록을 다시 표시하지 못합니다.

## 3단계 엔드게임의 수집 조건

**strictEndgame: true는 3단계 tw-hell에만 적용합니다.** 이 장비·고유 엄격화는 tw-normal·tw-hard에 적용하지 않습니다. hard·hell의 화폐·재료에는 위의 별도 제한을 적용합니다. 아이템 레벨 82 이상인 마법·희귀 장비를 모두 표시하지 않고, 원본의 품목별 규칙을 좁혀 저가 드롭을 줄입니다.

| 대상 | 3단계 기준 |
| --- | --- |
| 일반 마법 장비 | 숨김. 특수 제작 베이스·고품질·추가 소켓·확인 가능한 중요 옵션 등 우선 보호는 유지 |
| 일반 희귀 장비 | 선정한 상위 베이스 + 아이템 레벨 82 이상 + 미감정 등급 3 이상을 중심으로 표시. 낮은 등급과 비선정 베이스는 숨김 |
| 일반 고유 | NeverSink의 C/hideable 목록 숨김. 상위 등급·T3/B·다중 고유 베이스·특출난 상태·미등록 경고는 보호 |
| 룬·소울코어 | 원본 C/D/E·저가 공급 목록 숨김. S/A/B와 미등록 경고는 유지 |
| 에센스 | 원본 C/D/E 목록 숨김. S/A/B와 미등록 경고는 유지 |
| 기타 재료 | 원본 C등급 촉매·C/D등급 액체 감정의 정확한 이름 목록 숨김. 일반 화폐는 위 별도 제한 적용, 징조 전체 숨김은 없음 |
| 시련 열쇠 | 새겨진 결정(Inscribed Ultimatum)·진 바리야(Djinn Barya)의 정확한 두 이름을 모든 아이템 레벨·희귀도에서 숨김 |

기존 고유 반지 제작법·타락 고유 표시와 같은 앞쪽 규칙도 함께 조정해 저가 C등급이 우회 표시되지 않도록 합니다. 고가 고유와 같은 베이스를 공유하는 종류는 보호합니다. 범위 숨김과 장비 조건은 화폐·피나클 열쇠·서판·경로석·퀘스트·젬·주얼·금화를 통째로 숨기는 조건이 아닙니다.

시련 열쇠 숨김은 앞쪽의 보상 표시·소리 규칙보다 먼저 적용하며 normal·hard에는 추가하지 않습니다. 이름이 다른 Test of Cunning/Strength/Time/Will Barya 4종은 이 숨김에서 제외합니다.

S+ 가격 규칙은 품목 숨김보다 먼저 적용합니다. **현재 시세 검증 매핑은 55종이며, 일반 룬·소울코어·에센스·선정 재료의 숨김은 NeverSink 고정 등급 목록 기준입니다.** 심연 응시 4종 등 별도로 등록한 품목을 제외하면 이들의 실제 가격을 매시간 판정해 저가임을 보장하지 않습니다. 미감정 등급도 실제 판매가를 보장하지 않습니다.

## 세 필터 공통 심연 표시

**abyss-items.json의 정확한 품목명·클래스 26종**을 심연 대상으로 사용합니다. 뼈 재료 12종, 심연 징조 8종, 응시 4종, 거래용 Kulemak's Invitation, Abyss Tablet입니다. 기존 조건으로 표시되는 심연 아이템은 세 필터 모두 **흰 글씨 255 255 255 255·초록 테두리 0 255 0 255·검정 배경 0 0 0 255**를 사용합니다. 기존 하위 재료 숨김은 유지하므로 색상을 바꾸기 위해 숨긴 품목을 다시 표시하지 않습니다.

**검증된 개당 가격이 1 Divine 이상일 때만 심연 기본색보다 S+를 우선**해 빨간 글씨·빨간 테두리·흰 배경·빨간 빛기둥과 0161.wav를 적용합니다. 원본 S등급만으로 이 가격을 확정하지 않습니다. 1 Divine 미만이거나 유효 가격이 없는 심연 품목은 기본 초록색을 사용하며 0.1·0.01 Divine 가격 승격으로 주황색 등으로 바꾸지 않습니다. 이 가격 예외 밖에서는 기존 음원 분류와 빛기둥·아이콘을 유지하고 글씨·테두리·배경만 바꿉니다. 거울·히네코라의 777.wav는 그대로입니다.

혼합 원본 규칙에서 해당 심연 품목의 하위 집합만 복제해 기존 표시 조건·순서·숨김·음원을 보존합니다. Abyssal Signet 같은 일반 장비나 단순히 심연에서 떨어진 모든 장비를 심연 전용 품목으로 판별하는 기능은 없습니다. 동명 Kulemak's Invitation의 Quest Items 변형은 가격·심연 색상 대상에서 제외합니다.

Preserved Vertebrae는 고정 NeverSink 원본에는 없지만 개별 데이터 페이지에서 확인해 명시적으로 추가한 품목입니다. 각 26종의 데이터 출처는 abyss-items.json의 source에 기록했습니다. [심연 품목 자료](https://poe2db.tw/us/Abyss)

## 표시 기준

| 단계 | 글씨 | 테두리 | 배경 |
| --- | --- | --- | --- |
| **S+·S** | **빨강** | **빨강** | **흰색** |
| **A** | **흰색** | **주황색** | **주황색** |
| **B 이하** | NeverSink 기본값 | NeverSink 기본값 | NeverSink 기본값 |
| **심연 기본색** | **흰색** | **초록색** | **검정색** |

검증 대상 화폐·조각·등록 심연 품목의 개당 가치가 **1 Divine 이상이면 S+**로 강조합니다. 심연은 위의 별도 색상 규칙을 적용하며 원본 S라도 가격 미검증 상태에서는 초록색입니다. 그 밖의 C급 이하에는 개인 음원·테두리·강조를 추가하지 않습니다. 장비·고유의 1·2단계 표시·숨김은 NeverSink를 유지하고, 3단계는 위의 엄격화를 적용합니다. hard·hell의 화폐·재료 제한은 별도입니다. 남긴 일반 고유의 시각·기본 알림은 원본 등급을 유지하며 일괄 A급으로 바꾸지 않습니다. 심연 서판의 색상, 특출난 드롭·고유 서판의 지정 음원은 별도 예외를 따릅니다. 세부 기준은 [DISPLAY-POLICY.ko.md](DISPLAY-POLICY.ko.md)에 있습니다.

## 지정 음원과 적용 순서

가치 단위는 **Divine Orb 1개**입니다. 같은 아이템이 여러 조건에 해당하면 위쪽 소리를 우선합니다.

| 우선순위 | 대상 | 파일 |
| --- | --- | --- |
| 1 | 칼란드라의 거울·히네코라의 머리카락 (Hinekora's Lock) | **777.wav** |
| 2 | 특출난 장비·특수 고유·특수 경로석/T16·미등록 아이템 경고 | **0397.wav** |
| 3 | S+: Divine 자체·검증 대상 화폐·조각·심연 품목의 **개당 가치 ≥1 Divine** | **0161.wav** |
| 4 | 카오스 오브 | **0090.wav** |
| 5 | 알려진 서판(고유 포함)·일반 경로석 | **0398.wav** |
| 6 | 앞선 조건에 속하지 않는 표시 대상 A·B급(일반 고유 제외) | **0103.wav** |
| — | C급 이하·일반 고유 | NeverSink 기본 알림 |

금화는 이 사용자 등급에 넣지 않습니다. tw-normal은 원본 알림 정책을 유지하고 tw-hard·tw-hell은 별도 골드 숨김을 적용합니다. 숨긴 아이템에는 소리를 새로 추가하지 않습니다. 서판과 원본 규칙을 공유하는 **Sacred Bloom**은 서판 음원으로 잘못 분류하지 않습니다. Continue 장식 규칙에서는 소리를 정하지 않습니다.

**원본 S등급이어도 가격이 1 Divine 이상이라는 보장은 아닙니다.** 가격으로 S+가 된 화폐도 0161.wav를 유지합니다. 카오스 단가가 1 Divine 이상이면 가격 규칙이 우선하고, 거울·히네코라는 가격과 관계없이 777.wav를 유지합니다. 특출난 드롭의 0397.wav는 일반 등급 소리보다 우선합니다.

### 음원 파일 교체와 켜기/끄기

지정한 Drive 음원 7개를 내려받아 PCM WAV를 확인했으며, **현재 활성 음원은 6개이고 customSounds는 true입니다.** C급 이하용 **0011.wav는 설정과 생성 결과에서 제외**했습니다. 오디오 바이트는 재가공하지 않았으며 Linux에서도 경로가 일치하도록 확장자만 .WAV에서 **.wav**로 통일했습니다.

음원은 **assets/sounds**에서 관리하고, 결과에는 **sounds/파일명**으로 복사합니다. Drive 주소를 게임에서 직접 재생하지 않습니다. 이후 음원을 바꿀 때도 실제 파일을 확인해 배치한 다음에만 customSounds를 켭니다. 수집되지 않은 파일을 예전 대체음으로 바꿔 완료했다고 처리하지 않습니다. 고유 서판도 0398.wav 대상이지만 특출난 예외에 해당하면 0397.wav가 먼저 적용됩니다.

~~~json
"customSounds": true,
"sounds": {
  "value": "0161.wav",
  "chaos": "0090.wav",
  "maps": "0398.wav",
  "exceptional": "0397.wav",
  "pinnacle": "777.wav",
  "ab": "0103.wav"
}
~~~

위 설정은 지정 음원 6개를 사용합니다. 생성 결과의 활성 여부는 **config.json과 last-update.json**에서 확인합니다. customSounds를 false로 돌리면 활성 커스텀 음원 참조 없이 PoE2 기본 알림을 사용하고 WAV를 ZIP에 넣지 않습니다. 저장소에 남은 0011.wav와 이전 구분용 대체음 3개는 사용하지 않습니다.

음원 파일 이름을 바꾸면 sounds 설정도 함께 바꾸고 새 결과를 생성합니다. 같은 이름의 정상 WAV로 교체하면 경로를 유지할 수 있습니다. 확장자만 바꿔 형식을 변환하지 마세요. 게임 폴더의 음원은 별도 복사본이므로 새 ZIP의 sounds도 복사해야 합니다.

세 필터는 **동일한 sounds/*.wav 경로와 음원 6개**를 공유합니다. 같은 PC 필터 폴더에서 normal·hard·hell을 전환할 때 음원을 다시 설치할 필요가 없습니다. WAV 자체를 교체했을 때만 해당 파일을 갱신합니다. 숨긴 아이템에는 알림을 새로 추가하지 않습니다.

CustomAlertSoundOptional은 파일이 없으면 기본 알림을 유지하지만 손상되었거나 지원하지 않는 인코딩의 재생을 보장하지는 않습니다. 빛기둥·아이콘은 게임 내장 효과이며 외부 영상·이미지·파티클을 불러오지 않습니다. [공식 소리 문법](https://poe.kakaogames.com/item-filter/about)

## 시세 데이터와 실패 처리

자동 가격 검증 매핑은 **currency-map.json의 기존 29종(일반 화폐 28종·빛바랜 위기 조각 1종) + abyss-items.json의 심연 26종 = 55종**입니다. 심연은 정확한 품목명·클래스·거래 메타데이터를 함께 검증하며 Omen·Augment·Map Fragments 등을 일반 화폐 클래스로 바꾸지 않습니다. Kulemak's Invitation은 거래용 Map Fragments·Metadata/Items/Currency/Abyss/AbyssPinnacleKey로 한정하고 동명 퀘스트 변형은 제외합니다. [초대장 자료](https://poe2db.tw/us/Kulemaks_Invitation)

55종 모두의 가격이 매번 산출된다는 뜻은 아닙니다. 거래 자료가 없거나 수량·시간·안정성 검증이 부족하면 해당 가격을 채택하지 않습니다. Abyss Tablet은 확인한 거래 집계에 관측이 없어 기본 초록색으로 남을 수 있습니다. 실제 채택 품목은 보고서의 AcceptedPrices를 확인합니다. 미등록 아이템을 자동으로 가격 평가 대상에 추가하지 않으며 장비·룬·소울코어·에센스·고유 전체의 정확한 판매가를 평가하지 않습니다. 감정 전 옵션이나 같은 베이스의 고유 정체를 판별해 모든 고가 드롭을 찾아낸다는 뜻은 아닙니다.

빛바랜 위기 조각은 일반 화폐와 다른 **Pinnacle Keys** 클래스이며 거래 식별자는 **Metadata/Items/Pinnacle/BurningMonolithKey2**입니다. 동명의 퀘스트 아이템(Quest Items)은 가격 규칙에서 제외합니다. [아이템 자료](https://poe2db.tw/us/Faded_Crisis_Fragment)

공식 공개 주소 https://web.poecdn.com/api/currency-exchange/poe2/ 의 완료된 최근 3개 UTC 시간을 조회합니다. 심연 매핑을 추가해도 같은 집계를 사용하므로 시세 알고리즘과 실행당 최대 3회 요청은 그대로입니다. 진행 중인 시간의 주문장·호가는 제공되지 않습니다. PoE 로그인·OAuth·POESESSID는 요구하지 않습니다. [공식 Currency Exchange 문서](https://www.pathofexile.com/developer/docs/reference#currencyexchange)

volume_traded는 거래 건수가 아닌 아이템 수량입니다. **Divine 직접 거래·Chaos 경유·Exalted 경유**를 각각 개당 Divine 가격으로 환산합니다. 환산에는 같은 리그·같은 시간의 Divine 환율만 사용하며 Chaos 수량과 Divine 수량을 그대로 비교하지 않습니다.

**각 경로를 독립적으로 검증**합니다. 경로마다 최소 2개 완료 시간의 관측, 합산 대상 아이템 수량 10개, 합산 1 Divine 상당 거래 규모가 필요하며 시간별 단가의 최대/최소가 3배를 넘으면 그 경로를 제외합니다. 경로별로 대상 아이템 수량을 가중해 단가를 구한 뒤 **통과한 경로 중 가장 높은 Divine 단가**를 채택합니다. 시간마다 유리한 경로만 섞거나 서로 다른 경로의 수량을 중복 합산하지 않습니다.

예를 들어 직접 거래가 1 Divine, Chaos 경유 환산이 1.2 Divine이고 두 경로가 모두 검증을 통과했다면 **1.2 Divine**을 채택해 S+·0161.wav를 적용합니다. 이는 계산 예시이며 현재 시세가 아닙니다. 완료된 시간별 체결 집계에 기반한 추정치이므로 즉시 체결 가능한 현재 호가와 다를 수 있습니다.

재료 제한으로 숨기지 않은 일반 화폐는 원본 S/A/B를 최소 표시 단계로 유지하며 개당 1 Divine 이상 S+·0.1 이상 A·0.01 이상 B로 필요한 승격만 추가합니다. 가격 때문에 숨김을 추가하지 않습니다. hard·hell의 고정 화폐·재료 제한과 장비 구간·3단계 품목별 숨김은 별도 사용자 정책이며 S+가 우선합니다.

HTTP 오류·429·리그 불일치·구조 변경·유효 가격 부족은 실패로 처리합니다. 오프라인 기본 결과로 몰래 전환하지 않고 성공한 온라인 실행만 새 Artifact를 만듭니다. 기존 결과는 마지막 성공 당시의 시세이며 보관 기간이 지나면 다시 성공한 실행이 필요합니다. **last-update.json**에서 리그·자료 시간·계산 방식·채택 가격을 확인하세요. **CandidatePrices**는 경로별 검증 후보와 Divine 단가, **Routes**는 채택한 경로를 기록합니다.

## 공식 홈페이지에 등록하기

생성 ZIP의 **website-sources 폴더에서 원하는 TXT 파일**을 텍스트 편집기로 열고 **Ctrl+A → Ctrl+C**로 전체 내용을 복사해 공식 사이트의 필터 생성·편집 페이지 코드 칸에 붙여넣습니다. TXT는 해당 완성 .filter와 동일한 전체 소스이며 매 생성마다 함께 갱신됩니다. 게임은 **Path of Exile 2**로 선택하고 저장 전에 유효성 검사를 켭니다. src의 .mjs 생성기나 config.json을 붙여넣지 않습니다.

| 등록 이름 예시 | website-sources 안의 전체 소스 |
| --- | --- |
| tw-normal | tw-normal.filter.txt |
| tw-hard | tw-hard.filter.txt |
| tw-hell | tw-hell.filter.txt |

세 파일을 각각 등록할 수 있습니다. 기존 필터를 편집해 내용만 저장하면 같은 필터 ID와 팔로우를 유지할 수 있습니다. 게임에서 다시 불러와 적용합니다. 공개 체크는 다른 사람이 보기·팔로우·복사하도록 허용하는 설정입니다.

온라인 필터에도 커스텀 음원은 별도 설치가 필요합니다. Google Drive는 배포·미리듣기에 사용하고 게임에서는 기존 sounds 파일 경로를 사용합니다. **GitHub의 매시간 생성은 공식 계정 필터 자동 게시가 아닙니다.** 수동 등록 방식에서는 새 소스를 해당 필터에 다시 저장해야 합니다. [공식 필터 API](https://www.pathofexile.com/developer/docs/reference#account-item_filters), [공식 소리 문법](https://www.pathofexile.com/item-filter/about)

## 구성과 유지보수

| 위치 | 역할 |
| --- | --- |
| .github/workflows/update-filters.yml | 검사·온라인 생성·결과 ZIP 보관 |
| src/filter.mjs | 표시·레벨 구간·음원 우선순위 |
| src/economy.mjs | 공식 자료 검증과 Divine 기준 단가 |
| src/update.mjs | 원본 무결성 검사와 결과 생성 |
| config.json, currency-map.json | 리그·구간·음원 설정과 화폐 매핑 |
| abyss-items.json | 심연 26종의 정확한 분류·거래 식별자·데이터 출처 |
| upstream | 고정 NeverSink 원본 2종 |
| assets/sounds | 활성 지정 음원 6개와 사용하지 않는 이전 파일 |
| test | 게임 외부 자동 검사 |
| dist | 필터 3종·보고서·활성화한 음원·website-sources의 등록용 TXT |

원본은 [NeverSink PoE2 0.10.4a](https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/releases/tag/0.10.4a), 커밋 **1fc5b3ab99644388263fc991f832d9fac24a1f5d**에 고정합니다. 내부 버전 주석 0.10.4는 보존했습니다. SHA-256이 설정과 다르면 생성을 거부하며 해시를 임의로 바꿔 오류를 무시하지 않습니다. [MIT 라이선스](https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/blob/0.10.4a/LICENSE)와 크레딧을 보존합니다. GGG·NeverSink·FilterBlade와 제휴하거나 공식 승인을 받은 제품이 아닙니다.

새 리그는 정확한 league로 바꿉니다. 0.5 계열 이후 큰 패치에서 새 아이템·조건·이름이 바뀌면 원본과 매핑도 따로 검토해야 합니다. 시세 갱신만으로 문법과 아이템 목록이 최신화되지는 않습니다. 원격 생성의 성공 여부는 Actions 실행 기록으로 확인합니다.

로컬 확인이 필요할 때만 Node.js 24 이상으로 실행할 수 있습니다. 일반 설치·갱신에는 필요하지 않습니다.

~~~text
node --test
node src/update.mjs --offline
node src/update.mjs
~~~

--offline은 마지막 시세 유지 모드가 아니라 가격 규칙 없는 기본 결과 생성입니다. 온라인 실패 때 자동 전환하지 않습니다. 생성 .filter의 직접 수정은 다음 생성에서 유지되지 않으므로 지속할 설정은 저장소 원본에서 수정하세요.

생략한 범위: 착용 요구 레벨·전체 아이템 가격 판정·게임 입력/재로드 자동화·원본 자동 버전 전환.
미확인·위험: 실제 게임의 로드·음원 재생, 시세 지연·표본 부족·향후 패치 호환성.
