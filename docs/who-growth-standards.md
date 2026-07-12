# WHO 生长标准数据说明

## 用途与版本

生长曲线使用 WHO Child Growth Standards（2006）的官方扩展百分位表，覆盖出生第 0 天至第 1856 天。应用按宝宝出生性别分别显示体重/年龄、身长或身高/年龄、头围/年龄的 P3、P15、P50、P85、P97 五条曲线。

数据仅作为同年龄、同性别儿童生长分布的参考，不代表正常或异常，不能替代儿童保健或医生评估。

## 官方来源

文件于 2026-07-12 从 WHO 官方 CDN 下载。下面的 SHA-256 用于复核输入文件是否发生变化。

| 指标 | 性别 | 官方扩展表 | SHA-256 |
| --- | --- | --- | --- |
| 体重/年龄 | 女童 | [wfa-girls-percentiles-expanded-tables.xlsx](https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/expanded-tables/wfa-girls-percentiles-expanded-tables.xlsx?sfvrsn=54cfa5e8_9) | `5bdfd79de222d0f660c1662adc02995e879374f5b3260571a357a2ec771da629` |
| 体重/年龄 | 男童 | [wfa-boys-percentiles-expanded-tables.xlsx](https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/expanded-tables/wfa-boys-percentiles-expanded-tables.xlsx?sfvrsn=c2f79259_11) | `c4e251201c6cd352fbdd7797a7a298aff8c78b7525bd242fedec4494f3ccb095` |
| 身长/身高/年龄 | 女童 | [lhfa-girls-percentiles-expanded-tables.xlsx](https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-girls-percentiles-expanded-tables.xlsx?sfvrsn=478569a5_9) | `92b5b0306d87f32eeb1d0c68f32aceda55121ff9a2600af517ba2a5b8dc84851` |
| 身长/身高/年龄 | 男童 | [lhfa-boys-percentiles-expanded-tables.xlsx](https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-boys-percentiles-expanded-tables.xlsx?sfvrsn=bc36d818_9) | `8e163405223fcdf749f6689a8b8233d15182117c8a8b87f46c957fcfc498c7f2` |
| 头围/年龄 | 女童 | [hcfa-girls-percentiles-expanded-tables.xlsx](https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/head-circumference-for-age/expanded-tables/hcfa-girls-percentiles-expanded-tables.xlsx?sfvrsn=71b282d1_13) | `3e097ab1c73c9b376faea2bde2f10de761efbde486c9d6092a8ef63d21f2a5ff` |
| 头围/年龄 | 男童 | [hcfa-boys-percentiles-expanded-tables.xlsx](https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/head-circumference-for-age/expanded-tables/hcfa-boys-percentiles-expanded-tables.xlsx?sfvrsn=c266c88f_7) | `3e4d401a557841a93d56d552889d2778e4ad4e42585c8d768f5514aaf65979ff` |

WHO 标准入口：<https://www.who.int/tools/child-growth-standards/standards>

## 固化与查询规则

- `scripts/generate-who-growth-standards.py` 从上述 6 份 XLSX 的 `P3`、`P15`、`P50`、`P85`、`P97` 列生成 `lib/who-growth-data.generated.ts`。
- 每个数据集必须连续包含 day `0…1856`。生成器将三位小数放大 1000 倍，以首日绝对值加逐日差值编码；运行时解码后仍保留官方三位小数。
- 宝宝年龄按出生日期与测量日期的 UTC civil-day 差计算，直接查询对应年龄日，不做整月插值或网络请求。
- 为减少 SVG 节点，绘图可按周抽样官方日值；宝宝测量点的参考读数始终查询精确年龄日。
- 身长/身高标准在 day 0–730 使用卧位身长，在 day 731 起使用立位身高。图形在 day 730/731 处分成两段，不跨越测量方式切换点插值。
- 出生性别未设置时只显示宝宝个人趋势，不猜测、不平均男女标准。
- WHO 标准在 day 1856 结束；更大年龄的个人测量仍会继续绘制，并在界面明确提示标准参考已经结束。

重新生成示例（需 Python 3 与 `openpyxl`）：

```bash
python3 scripts/generate-who-growth-standards.py --source-dir /path/to/downloaded-xlsx
```

## 当前限制

- 生长记录尚未单独保存实际测量体位；界面按年龄提示 2 岁前测量卧位身长、2 岁后测量立位身高，但不会自动执行 `±0.7cm` 体位换算。
- 当前不自动计算早产儿矫正年龄。
- 百分位曲线用于观察趋势，不能单凭一次测量或单条百分位作健康判断。
