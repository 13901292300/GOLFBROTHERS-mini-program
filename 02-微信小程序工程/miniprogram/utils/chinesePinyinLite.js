/**
 * 轻量中文拼音（选手管理统一首字母排序用）。
 * 优先全拼字典；未命中时回退到拼音首字母表。
 * 后续可替换为完整拼音工具，接口保持 chineseToPinyin / getPinyinInitial。
 */

/** 常见姓氏 / 名字用字全拼（小写、无音调） */
const CHAR_PINYIN = {
  阿: 'a', 啊: 'a', 艾: 'ai', 安: 'an', 敖: 'ao',
  巴: 'ba', 白: 'bai', 百: 'bai', 班: 'ban', 包: 'bao', 鲍: 'bao', 保: 'bao', 北: 'bei', 贝: 'bei', 本: 'ben', 比: 'bi', 彼: 'bi', 毕: 'bi', 边: 'bian', 卞: 'bian', 彪: 'biao', 别: 'bie', 宾: 'bin', 冰: 'bing', 兵: 'bing', 波: 'bo', 伯: 'bo', 博: 'bo', 卜: 'bu', 布: 'bu',
  蔡: 'cai', 参: 'can', 曹: 'cao', 策: 'ce', 曾: 'ceng', 茶: 'cha', 柴: 'chai', 昌: 'chang', 常: 'chang', 超: 'chao', 朝: 'chao', 车: 'che', 陈: 'chen', 成: 'cheng', 程: 'cheng', 承: 'cheng', 诚: 'cheng', 池: 'chi', 迟: 'chi', 充: 'chong', 崇: 'chong', 楚: 'chu', 初: 'chu', 川: 'chuan', 传: 'chuan', 春: 'chun', 纯: 'chun', 慈: 'ci', 从: 'cong', 崔: 'cui',
  达: 'da', 大: 'da', 戴: 'dai', 代: 'dai', 丹: 'dan', 单: 'dan', 旦: 'dan', 党: 'dang', 道: 'dao', 德: 'de', 邓: 'deng', 狄: 'di', 迪: 'di', 弟: 'di', 蒂: 'di', 典: 'dian', 丁: 'ding', 定: 'ding', 东: 'dong', 董: 'dong', 栋: 'dong', 斗: 'dou', 杜: 'du', 度: 'du', 端: 'duan', 段: 'duan', 敦: 'dun', 多: 'duo',
  恩: 'en', 尔: 'er', 二: 'er',
  发: 'fa', 法: 'fa', 樊: 'fan', 凡: 'fan', 范: 'fan', 方: 'fang', 芳: 'fang', 防: 'fang', 飞: 'fei', 菲: 'fei', 费: 'fei', 芬: 'fen', 丰: 'feng', 风: 'feng', 冯: 'feng', 逢: 'feng', 凤: 'feng', 夫: 'fu', 福: 'fu', 甫: 'fu', 府: 'fu', 傅: 'fu', 富: 'fu',
  甘: 'gan', 刚: 'gang', 纲: 'gang', 高: 'gao', 杲: 'gao', 戈: 'ge', 哥: 'ge', 歌: 'ge', 革: 'ge', 格: 'ge', 葛: 'ge', 耿: 'geng', 工: 'gong', 公: 'gong', 功: 'gong', 宫: 'gong', 龚: 'gong', 巩: 'gong', 共: 'gong', 苟: 'gou', 古: 'gu', 谷: 'gu', 顾: 'gu', 固: 'gu', 瓜: 'gua', 关: 'guan', 观: 'guan', 官: 'guan', 冠: 'guan', 管: 'guan', 光: 'guang', 广: 'guang', 桂: 'gui', 贵: 'gui', 郭: 'guo', 国: 'guo', 果: 'guo',
  海: 'hai', 含: 'han', 韩: 'han', 寒: 'han', 汉: 'han', 杭: 'hang', 豪: 'hao', 好: 'hao', 昊: 'hao', 浩: 'hao', 合: 'he', 何: 'he', 和: 'he', 河: 'he', 贺: 'he', 赫: 'he', 黑: 'hei', 亨: 'heng', 恒: 'heng', 衡: 'heng', 弘: 'hong', 红: 'hong', 宏: 'hong', 洪: 'hong', 鸿: 'hong', 侯: 'hou', 后: 'hou', 厚: 'hou', 呼: 'hu', 忽: 'hu', 胡: 'hu', 湖: 'hu', 虎: 'hu', 花: 'hua', 华: 'hua', 滑: 'hua', 怀: 'huai', 淮: 'huai', 欢: 'huan', 环: 'huan', 桓: 'huan', 焕: 'huan', 黄: 'huang', 煌: 'huang', 回: 'hui', 惠: 'hui', 慧: 'hui', 浑: 'hun', 混: 'hun', 霍: 'huo',
  机: 'ji', 积: 'ji', 基: 'ji', 吉: 'ji', 级: 'ji', 极: 'ji', 即: 'ji', 急: 'ji', 疾: 'ji', 集: 'ji', 籍: 'ji', 几: 'ji', 己: 'ji', 纪: 'ji', 季: 'ji', 济: 'ji', 继: 'ji', 寄: 'ji', 佳: 'jia', 家: 'jia', 嘉: 'jia', 甲: 'jia', 贾: 'jia', 坚: 'jian', 间: 'jian', 兼: 'jian', 建: 'jian', 健: 'jian', 剑: 'jian', 江: 'jiang', 姜: 'jiang', 将: 'jiang', 蒋: 'jiang', 交: 'jiao', 焦: 'jiao', 角: 'jiao', 教: 'jiao', 杰: 'jie', 洁: 'jie', 结: 'jie', 捷: 'jie', 解: 'jie', 介: 'jie', 金: 'jin', 津: 'jin', 锦: 'jin', 谨: 'jin', 进: 'jin', 晋: 'jin', 京: 'jing', 经: 'jing', 荆: 'jing', 精: 'jing', 晶: 'jing', 井: 'jing', 景: 'jing', 竞: 'jing', 敬: 'jing', 静: 'jing', 靖: 'jing', 炯: 'jiong', 九: 'jiu', 久: 'jiu', 酒: 'jiu', 旧: 'jiu', 居: 'ju', 菊: 'ju', 橘: 'ju', 举: 'ju', 巨: 'ju', 句: 'ju', 具: 'ju', 俱: 'ju', 剧: 'ju', 娟: 'juan', 倦: 'juan', 决: 'jue', 绝: 'jue', 觉: 'jue', 军: 'jun', 君: 'jun', 钧: 'jun', 俊: 'jun', 峻: 'jun',
  卡: 'ka', 开: 'kai', 凯: 'kai', 楷: 'kai', 康: 'kang', 抗: 'kang', 考: 'kao', 柯: 'ke', 科: 'ke', 可: 'ke', 克: 'ke', 刻: 'ke', 空: 'kong', 孔: 'kong', 恐: 'kong', 口: 'kou', 扣: 'kou', 寇: 'kou', 苦: 'ku', 库: 'ku', 酷: 'ku', 夸: 'kua', 跨: 'kua', 快: 'kuai', 宽: 'kuan', 款: 'kuan', 匡: 'kuang', 狂: 'kuang', 况: 'kuang', 旷: 'kuang', 亏: 'kui', 奎: 'kui', 葵: 'kui', 魁: 'kui', 坤: 'kun', 昆: 'kun', 困: 'kun', 扩: 'kuo', 阔: 'kuo',
  拉: 'la', 啦: 'la', 来: 'lai', 莱: 'lai', 赖: 'lai', 兰: 'lan', 蓝: 'lan', 岚: 'lan', 览: 'lan', 懒: 'lan', 郎: 'lang', 朗: 'lang', 浪: 'lang', 劳: 'lao', 老: 'lao', 乐: 'le', 雷: 'lei', 磊: 'lei', 蕾: 'lei', 冷: 'leng', 黎: 'li', 离: 'li', 梨: 'li', 李: 'li', 里: 'li', 理: 'li', 力: 'li', 历: 'li', 立: 'li', 丽: 'li', 利: 'li', 励: 'li', 连: 'lian', 莲: 'lian', 联: 'lian', 廉: 'lian', 炼: 'lian', 恋: 'lian', 良: 'liang', 梁: 'liang', 两: 'liang', 亮: 'liang', 量: 'liang', 辽: 'liao', 聊: 'liao', 廖: 'liao', 烈: 'lie', 林: 'lin', 临: 'lin', 淋: 'lin', 琳: 'lin', 霖: 'lin', 麟: 'lin', 灵: 'ling', 凌: 'ling', 铃: 'ling', 陵: 'ling', 零: 'ling', 领: 'ling', 令: 'ling', 刘: 'liu', 流: 'liu', 留: 'liu', 柳: 'liu', 六: 'liu', 龙: 'long', 隆: 'long', 娄: 'lou', 楼: 'lou', 卢: 'lu', 庐: 'lu', 芦: 'lu', 炉: 'lu', 鲁: 'lu', 陆: 'lu', 录: 'lu', 鹿: 'lu', 禄: 'lu', 路: 'lu', 露: 'lu', 吕: 'lv', 旅: 'lv', 履: 'lv', 律: 'lv', 虑: 'lv', 率: 'lv', 绿: 'lv', 孪: 'luan', 峦: 'luan', 伦: 'lun', 轮: 'lun', 论: 'lun', 罗: 'luo', 萝: 'luo', 逻: 'luo', 洛: 'luo', 络: 'luo', 骆: 'luo',
  妈: 'ma', 麻: 'ma', 马: 'ma', 玛: 'ma', 迈: 'mai', 麦: 'mai', 卖: 'mai', 满: 'man', 曼: 'man', 慢: 'man', 芒: 'mang', 忙: 'mang', 毛: 'mao', 矛: 'mao', 茅: 'mao', 茂: 'mao', 冒: 'mao', 么: 'me', 没: 'mei', 枚: 'mei', 眉: 'mei', 梅: 'mei', 媒: 'mei', 美: 'mei', 门: 'men', 们: 'men', 萌: 'meng', 盟: 'meng', 孟: 'meng', 梦: 'meng', 弥: 'mi', 迷: 'mi', 米: 'mi', 秘: 'mi', 密: 'mi', 蜜: 'mi', 眠: 'mian', 绵: 'mian', 免: 'mian', 勉: 'mian', 面: 'mian', 苗: 'miao', 描: 'miao', 秒: 'miao', 妙: 'miao', 庙: 'miao', 灭: 'mie', 民: 'min', 敏: 'min', 名: 'ming', 明: 'ming', 鸣: 'ming', 铭: 'ming', 命: 'ming', 谬: 'miu', 摸: 'mo', 模: 'mo', 摩: 'mo', 磨: 'mo', 魔: 'mo', 末: 'mo', 莫: 'mo', 墨: 'mo', 默: 'mo', 牟: 'mou', 某: 'mou', 母: 'mu', 牡: 'mu', 亩: 'mu', 木: 'mu', 目: 'mu', 牧: 'mu', 穆: 'mu',
  拿: 'na', 哪: 'na', 内: 'nei', 那: 'na', 纳: 'na', 娜: 'na', 乃: 'nai', 奈: 'nai', 耐: 'nai', 男: 'nan', 南: 'nan', 难: 'nan', 囊: 'nang', 恼: 'nao', 脑: 'nao', 呢: 'ne', 能: 'neng', 尼: 'ni', 泥: 'ni', 你: 'ni', 拟: 'ni', 逆: 'ni', 年: 'nian', 念: 'nian', 娘: 'niang', 鸟: 'niao', 尿: 'niao', 捏: 'nie', 您: 'nin', 宁: 'ning', 凝: 'ning', 牛: 'niu', 纽: 'niu', 农: 'nong', 浓: 'nong', 弄: 'nong', 奴: 'nu', 努: 'nu', 怒: 'nu', 女: 'nv', 暖: 'nuan', 虐: 'nve', 挪: 'nuo', 诺: 'nuo',
  欧: 'ou', 鸥: 'ou', 偶: 'ou',
  啪: 'pa', 爬: 'pa', 帕: 'pa', 怕: 'pa', 拍: 'pai', 排: 'pai', 牌: 'pai', 派: 'pai', 攀: 'pan', 盘: 'pan', 判: 'pan', 叛: 'pan', 庞: 'pang', 旁: 'pang', 胖: 'pang', 抛: 'pao', 跑: 'pao', 泡: 'pao', 陪: 'pei', 培: 'pei', 赔: 'pei', 佩: 'pei', 配: 'pei', 喷: 'pen', 盆: 'pen', 朋: 'peng', 彭: 'peng', 棚: 'peng', 蓬: 'peng', 鹏: 'peng', 捧: 'peng', 碰: 'peng', 批: 'pi', 披: 'pi', 皮: 'pi', 疲: 'pi', 匹: 'pi', 屁: 'pi', 偏: 'pian', 片: 'pian', 骗: 'pian', 漂: 'piao', 飘: 'piao', 票: 'piao', 撇: 'pie', 拼: 'pin', 贫: 'pin', 频: 'pin', 品: 'pin', 平: 'ping', 评: 'ping', 凭: 'ping', 萍: 'ping', 坡: 'po', 泼: 'po', 颇: 'po', 破: 'po', 魄: 'po', 剖: 'pou', 扑: 'pu', 铺: 'pu', 仆: 'pu', 葡: 'pu', 菩: 'pu', 朴: 'pu', 普: 'pu', 谱: 'pu',
  七: 'qi', 妻: 'qi', 戚: 'qi', 期: 'qi', 欺: 'qi', 齐: 'qi', 其: 'qi', 奇: 'qi', 歧: 'qi', 骑: 'qi', 棋: 'qi', 旗: 'qi', 企: 'qi', 启: 'qi', 起: 'qi', 气: 'qi', 弃: 'qi', 汽: 'qi', 契: 'qi', 砌: 'qi', 器: 'qi', 恰: 'qia', 千: 'qian', 迁: 'qian', 牵: 'qian', 铅: 'qian', 谦: 'qian', 签: 'qian', 前: 'qian', 钱: 'qian', 乾: 'qian', 潜: 'qian', 浅: 'qian', 遣: 'qian', 欠: 'qian', 枪: 'qiang', 腔: 'qiang', 强: 'qiang', 墙: 'qiang', 抢: 'qiang', 悄: 'qiao', 敲: 'qiao', 乔: 'qiao', 桥: 'qiao', 樵: 'qiao', 巧: 'qiao', 切: 'qie', 且: 'qie', 窃: 'qie', 亲: 'qin', 侵: 'qin', 秦: 'qin', 琴: 'qin', 勤: 'qin', 青: 'qing', 轻: 'qing', 倾: 'qing', 清: 'qing', 情: 'qing', 晴: 'qing', 擎: 'qing', 顷: 'qing', 请: 'qing', 庆: 'qing', 穷: 'qiong', 琼: 'qiong', 丘: 'qiu', 秋: 'qiu', 邱: 'qiu', 求: 'qiu', 球: 'qiu', 区: 'qu', 曲: 'qu', 驱: 'qu', 屈: 'qu', 趋: 'qu', 取: 'qu', 娶: 'qu', 去: 'qu', 趣: 'qu', 圈: 'quan', 全: 'quan', 权: 'quan', 泉: 'quan', 拳: 'quan', 犬: 'quan', 劝: 'quan', 缺: 'que', 却: 'que', 确: 'que', 雀: 'que', 裙: 'qun', 群: 'qun',
  然: 'ran', 燃: 'ran', 染: 'ran', 嚷: 'rang', 壤: 'rang', 让: 'rang', 饶: 'rao', 扰: 'rao', 绕: 'rao', 惹: 're', 热: 're', 人: 'ren', 仁: 'ren', 忍: 'ren', 认: 'ren', 任: 'ren', 扔: 'reng', 仍: 'reng', 日: 'ri', 戎: 'rong', 荣: 'rong', 容: 'rong', 溶: 'rong', 熔: 'rong', 融: 'rong', 柔: 'rou', 肉: 'rou', 如: 'ru', 儒: 'ru', 乳: 'ru', 辱: 'ru', 入: 'ru', 软: 'ruan', 阮: 'ruan', 蕊: 'rui', 瑞: 'rui', 锐: 'rui', 润: 'run', 若: 'ruo', 弱: 'ruo',
  撒: 'sa', 洒: 'sa', 萨: 'sa', 塞: 'sai', 赛: 'sai', 三: 'san', 伞: 'san', 散: 'san', 桑: 'sang', 嗓: 'sang', 丧: 'sang', 扫: 'sao', 嫂: 'sao', 色: 'se', 森: 'sen', 僧: 'seng', 杀: 'sha', 沙: 'sha', 纱: 'sha', 傻: 'sha', 啥: 'sha', 晒: 'shai', 山: 'shan', 删: 'shan', 闪: 'shan', 陕: 'shan', 扇: 'shan', 善: 'shan', 伤: 'shang', 商: 'shang', 赏: 'shang', 上: 'shang', 尚: 'shang', 梢: 'shao', 烧: 'shao', 稍: 'shao', 少: 'shao', 绍: 'shao', 哨: 'shao', 奢: 'she', 蛇: 'she', 舍: 'she', 设: 'she', 社: 'she', 射: 'she', 涉: 'she', 摄: 'she', 申: 'shen', 伸: 'shen', 身: 'shen', 深: 'shen', 神: 'shen', 沈: 'shen', 审: 'shen', 婶: 'shen', 甚: 'shen', 慎: 'shen', 升: 'sheng', 生: 'sheng', 声: 'sheng', 胜: 'sheng', 圣: 'sheng', 盛: 'sheng', 剩: 'sheng', 尸: 'shi', 失: 'shi', 师: 'shi', 诗: 'shi', 施: 'shi', 狮: 'shi', 湿: 'shi', 十: 'shi', 什: 'shi', 石: 'shi', 时: 'shi', 识: 'shi', 实: 'shi', 食: 'shi', 史: 'shi', 使: 'shi', 始: 'shi', 驶: 'shi', 士: 'shi', 氏: 'shi', 世: 'shi', 市: 'shi', 示: 'shi', 式: 'shi', 事: 'shi', 侍: 'shi', 势: 'shi', 视: 'shi', 试: 'shi', 饰: 'shi', 是: 'shi', 适: 'shi', 室: 'shi', 逝: 'shi', 释: 'shi', 收: 'shou', 手: 'shou', 守: 'shou', 首: 'shou', 寿: 'shou', 受: 'shou', 授: 'shou', 瘦: 'shou', 书: 'shu', 抒: 'shu', 叔: 'shu', 枢: 'shu', 殊: 'shu', 疏: 'shu', 舒: 'shu', 输: 'shu', 熟: 'shu', 暑: 'shu', 属: 'shu', 鼠: 'shu', 蜀: 'shu', 术: 'shu', 束: 'shu', 述: 'shu', 树: 'shu', 竖: 'shu', 数: 'shu', 刷: 'shua', 耍: 'shua', 衰: 'shuai', 摔: 'shuai', 甩: 'shuai', 帅: 'shuai', 双: 'shuang', 霜: 'shuang', 爽: 'shuang', 谁: 'shui', 水: 'shui', 税: 'shui', 睡: 'shui', 顺: 'shun', 舜: 'shun', 瞬: 'shun', 说: 'shuo', 烁: 'shuo', 硕: 'shuo', 司: 'si', 丝: 'si', 私: 'si', 思: 'si', 斯: 'si', 死: 'si', 四: 'si', 寺: 'si', 似: 'si', 松: 'song', 耸: 'song', 宋: 'song', 送: 'song', 颂: 'song', 搜: 'sou', 艘: 'sou', 苏: 'su', 俗: 'su', 诉: 'su', 肃: 'su', 素: 'su', 速: 'su', 宿: 'su', 塑: 'su', 酸: 'suan', 蒜: 'suan', 算: 'suan', 虽: 'sui', 隋: 'sui', 随: 'sui', 髓: 'sui', 岁: 'sui', 遂: 'sui', 碎: 'sui', 穗: 'sui', 孙: 'sun', 损: 'sun', 笋: 'sun', 缩: 'suo', 所: 'suo', 索: 'suo', 锁: 'suo',
  他: 'ta', 它: 'ta', 她: 'ta', 塔: 'ta', 踏: 'ta', 胎: 'tai', 台: 'tai', 抬: 'tai', 太: 'tai', 态: 'tai', 泰: 'tai', 贪: 'tan', 摊: 'tan', 滩: 'tan', 坛: 'tan', 谈: 'tan', 谭: 'tan', 潭: 'tan', 坦: 'tan', 叹: 'tan', 炭: 'tan', 探: 'tan', 汤: 'tang', 唐: 'tang', 堂: 'tang', 塘: 'tang', 糖: 'tang', 躺: 'tang', 烫: 'tang', 趟: 'tang', 涛: 'tao', 绦: 'tao', 掏: 'tao', 逃: 'tao', 桃: 'tao', 陶: 'tao', 淘: 'tao', 讨: 'tao', 套: 'tao', 特: 'te', 腾: 'teng', 疼: 'teng', 藤: 'teng', 梯: 'ti', 踢: 'ti', 提: 'ti', 题: 'ti', 蹄: 'ti', 体: 'ti', 替: 'ti', 天: 'tian', 添: 'tian', 田: 'tian', 甜: 'tian', 填: 'tian', 挑: 'tiao', 条: 'tiao', 迢: 'tiao', 调: 'tiao', 跳: 'tiao', 贴: 'tie', 铁: 'tie', 厅: 'ting', 听: 'ting', 廷: 'ting', 亭: 'ting', 庭: 'ting', 停: 'ting', 挺: 'ting', 艇: 'ting', 通: 'tong', 同: 'tong', 桐: 'tong', 铜: 'tong', 童: 'tong', 统: 'tong', 痛: 'tong', 偷: 'tou', 头: 'tou', 投: 'tou', 透: 'tou', 突: 'tu', 图: 'tu', 徒: 'tu', 涂: 'tu', 途: 'tu', 屠: 'tu', 土: 'tu', 吐: 'tu', 兔: 'tu', 团: 'tuan', 推: 'tui', 腿: 'tui', 退: 'tui', 吞: 'tun', 屯: 'tun', 托: 'tuo', 拖: 'tuo', 脱: 'tuo', 驼: 'tuo', 妥: 'tuo', 拓: 'tuo',
  挖: 'wa', 哇: 'wa', 娃: 'wa', 瓦: 'wa', 袜: 'wa', 歪: 'wai', 外: 'wai', 弯: 'wan', 湾: 'wan', 玩: 'wan', 顽: 'wan', 丸: 'wan', 完: 'wan', 晚: 'wan', 碗: 'wan', 万: 'wan', 汪: 'wang', 亡: 'wang', 王: 'wang', 网: 'wang', 往: 'wang', 忘: 'wang', 旺: 'wang', 望: 'wang', 危: 'wei', 威: 'wei', 微: 'wei', 为: 'wei', 围: 'wei', 违: 'wei', 唯: 'wei', 惟: 'wei', 维: 'wei', 伟: 'wei', 伪: 'wei', 尾: 'wei', 纬: 'wei', 委: 'wei', 卫: 'wei', 未: 'wei', 位: 'wei', 味: 'wei', 畏: 'wei', 胃: 'wei', 尉: 'wei', 谓: 'wei', 喂: 'wei', 蔚: 'wei', 魏: 'wei', 温: 'wen', 文: 'wen', 纹: 'wen', 闻: 'wen', 蚊: 'wen', 稳: 'wen', 问: 'wen', 翁: 'weng', 窝: 'wo', 我: 'wo', 沃: 'wo', 卧: 'wo', 握: 'wo', 乌: 'wu', 污: 'wu', 巫: 'wu', 屋: 'wu', 无: 'wu', 吴: 'wu', 吾: 'wu', 五: 'wu', 午: 'wu', 伍: 'wu', 武: 'wu', 舞: 'wu', 务: 'wu', 物: 'wu', 误: 'wu', 悟: 'wu', 雾: 'wu',
  夕: 'xi', 西: 'xi', 吸: 'xi', 希: 'xi', 昔: 'xi', 析: 'xi', 息: 'xi', 牺: 'xi', 悉: 'xi', 惜: 'xi', 晰: 'xi', 稀: 'xi', 溪: 'xi', 锡: 'xi', 熙: 'xi', 嘻: 'xi', 膝: 'xi', 习: 'xi', 席: 'xi', 袭: 'xi', 洗: 'xi', 喜: 'xi', 戏: 'xi', 系: 'xi', 细: 'xi', 隙: 'xi', 虾: 'xia', 瞎: 'xia', 匣: 'xia', 侠: 'xia', 峡: 'xia', 狭: 'xia', 夏: 'xia', 厦: 'xia', 下: 'xia', 吓: 'xia', 仙: 'xian', 先: 'xian', 纤: 'xian', 掀: 'xian', 鲜: 'xian', 闲: 'xian', 贤: 'xian', 弦: 'xian', 咸: 'xian', 衔: 'xian', 嫌: 'xian', 显: 'xian', 险: 'xian', 县: 'xian', 现: 'xian', 线: 'xian', 限: 'xian', 宪: 'xian', 陷: 'xian', 献: 'xian', 腺: 'xian', 乡: 'xiang', 相: 'xiang', 香: 'xiang', 厢: 'xiang', 湘: 'xiang', 箱: 'xiang', 详: 'xiang', 祥: 'xiang', 翔: 'xiang', 享: 'xiang', 响: 'xiang', 想: 'xiang', 向: 'xiang', 巷: 'xiang', 项: 'xiang', 象: 'xiang', 像: 'xiang', 橡: 'xiang', 肖: 'xiao', 枭: 'xiao', 削: 'xiao', 消: 'xiao', 宵: 'xiao', 萧: 'xiao', 销: 'xiao', 小: 'xiao', 晓: 'xiao', 孝: 'xiao', 效: 'xiao', 校: 'xiao', 笑: 'xiao', 些: 'xie', 歇: 'xie', 协: 'xie', 邪: 'xie', 胁: 'xie', 斜: 'xie', 携: 'xie', 鞋: 'xie', 写: 'xie', 泄: 'xie', 泻: 'xie', 卸: 'xie', 屑: 'xie', 械: 'xie', 谢: 'xie', 蟹: 'xie', 心: 'xin', 辛: 'xin', 欣: 'xin', 新: 'xin', 薪: 'xin', 信: 'xin', 兴: 'xing', 星: 'xing', 腥: 'xing', 刑: 'xing', 行: 'xing', 形: 'xing', 邢: 'xing', 型: 'xing', 醒: 'xing', 幸: 'xing', 性: 'xing', 姓: 'xing', 兄: 'xiong', 凶: 'xiong', 胸: 'xiong', 雄: 'xiong', 熊: 'xiong', 休: 'xiu', 修: 'xiu', 羞: 'xiu', 朽: 'xiu', 秀: 'xiu', 绣: 'xiu', 袖: 'xiu', 锈: 'xiu', 须: 'xu', 虚: 'xu', 需: 'xu', 徐: 'xu', 许: 'xu', 序: 'xu', 叙: 'xu', 畜: 'xu', 酗: 'xu', 绪: 'xu', 续: 'xu', 蓄: 'xu', 宣: 'xuan', 喧: 'xuan', 玄: 'xuan', 悬: 'xuan', 旋: 'xuan', 选: 'xuan', 癣: 'xuan', 炫: 'xuan', 绚: 'xuan', 眩: 'xuan', 靴: 'xue', 穴: 'xue', 学: 'xue', 雪: 'xue', 血: 'xue', 勋: 'xun', 熏: 'xun', 寻: 'xun', 巡: 'xun', 询: 'xun', 循: 'xun', 训: 'xun', 讯: 'xun', 迅: 'xun', 逊: 'xun',
  压: 'ya', 呀: 'ya', 押: 'ya', 鸦: 'ya', 鸭: 'ya', 牙: 'ya', 芽: 'ya', 崖: 'ya', 哑: 'ya', 雅: 'ya', 亚: 'ya', 咽: 'yan', 烟: 'yan', 淹: 'yan', 延: 'yan', 严: 'yan', 言: 'yan', 岩: 'yan', 炎: 'yan', 沿: 'yan', 研: 'yan', 盐: 'yan', 颜: 'yan', 衍: 'yan', 掩: 'yan', 眼: 'yan', 演: 'yan', 厌: 'yan', 宴: 'yan', 艳: 'yan', 验: 'yan', 谚: 'yan', 焰: 'yan', 雁: 'yan', 燕: 'yan', 央: 'yang', 殃: 'yang', 秧: 'yang', 扬: 'yang', 羊: 'yang', 阳: 'yang', 杨: 'yang', 洋: 'yang', 仰: 'yang', 养: 'yang', 氧: 'yang', 痒: 'yang', 样: 'yang', 漾: 'yang', 夭: 'yao', 妖: 'yao', 腰: 'yao', 邀: 'yao', 姚: 'yao', 遥: 'yao', 瑶: 'yao', 咬: 'yao', 药: 'yao', 要: 'yao', 耀: 'yao', 爷: 'ye', 也: 'ye', 冶: 'ye', 野: 'ye', 业: 'ye', 叶: 'ye', 页: 'ye', 夜: 'ye', 液: 'ye', 一: 'yi', 伊: 'yi', 衣: 'yi', 医: 'yi', 依: 'yi', 仪: 'yi', 夷: 'yi', 宜: 'yi', 怡: 'yi', 贻: 'yi', 移: 'yi', 遗: 'yi', 仪: 'yi', 疑: 'yi', 乙: 'yi', 已: 'yi', 以: 'yi', 矣: 'yi', 蚁: 'yi', 倚: 'yi', 椅: 'yi', 义: 'yi', 亿: 'yi', 忆: 'yi', 艺: 'yi', 议: 'yi', 亦: 'yi', 异: 'yi', 役: 'yi', 抑: 'yi', 译: 'yi', 易: 'yi', 诣: 'yi', 益: 'yi', 谊: 'yi', 逸: 'yi', 意: 'yi', 溢: 'yi', 毅: 'yi', 翼: 'yi', 因: 'yin', 阴: 'yin', 音: 'yin', 姻: 'yin', 银: 'yin', 淫: 'yin', 尹: 'yin', 引: 'yin', 饮: 'yin', 隐: 'yin', 印: 'yin', 英: 'ying', 婴: 'ying', 应: 'ying', 鹰: 'ying', 迎: 'ying', 盈: 'ying', 莹: 'ying', 营: 'ying', 蝇: 'ying', 赢: 'ying', 影: 'ying', 映: 'ying', 硬: 'ying', 哟: 'yo', 拥: 'yong', 庸: 'yong', 永: 'yong', 泳: 'yong', 勇: 'yong', 涌: 'yong', 用: 'yong', 优: 'you', 忧: 'you', 悠: 'you', 尤: 'you', 由: 'you', 邮: 'you', 犹: 'you', 油: 'you', 游: 'you', 友: 'you', 有: 'you', 又: 'you', 右: 'you', 幼: 'you', 诱: 'you', 于: 'yu', 予: 'yu', 余: 'yu', 鱼: 'yu', 娱: 'yu', 渔: 'yu', 愉: 'yu', 愚: 'yu', 榆: 'yu', 舆: 'yu', 与: 'yu', 屿: 'yu', 宇: 'yu', 羽: 'yu', 雨: 'yu', 语: 'yu', 玉: 'yu', 吁: 'yu', 育: 'yu', 郁: 'yu', 狱: 'yu', 浴: 'yu', 预: 'yu', 域: 'yu', 欲: 'yu', 喻: 'yu', 寓: 'yu', 御: 'yu', 裕: 'yu', 遇: 'yu', 誉: 'yu', 豫: 'yu', 元: 'yuan', 员: 'yuan', 园: 'yuan', 原: 'yuan', 圆: 'yuan', 袁: 'yuan', 援: 'yuan', 缘: 'yuan', 源: 'yuan', 远: 'yuan', 怨: 'yuan', 院: 'yuan', 愿: 'yuan', 曰: 'yue', 约: 'yue', 月: 'yue', 岳: 'yue', 钥: 'yue', 悦: 'yue', 阅: 'yue', 跃: 'yue', 越: 'yue', 云: 'yun', 匀: 'yun', 允: 'yun', 孕: 'yun', 运: 'yun', 酝: 'yun', 韵: 'yun', 蕴: 'yun',
  杂: 'za', 砸: 'za', 灾: 'zai', 哉: 'zai', 栽: 'zai', 宰: 'zai', 载: 'zai', 再: 'zai', 在: 'zai', 咱: 'zan', 暂: 'zan', 赞: 'zan', 脏: 'zang', 藏: 'zang', 葬: 'zang', 遭: 'zao', 糟: 'zao', 早: 'zao', 枣: 'zao', 澡: 'zao', 造: 'zao', 噪: 'zao', 燥: 'zao', 则: 'ze', 择: 'ze', 泽: 'ze', 责: 'ze', 贼: 'zei', 怎: 'zen', 增: 'zeng', 赠: 'zeng', 扎: 'zha', 渣: 'zha', 札: 'zha', 轧: 'zha', 闸: 'zha', 炸: 'zha', 眨: 'zha', 乍: 'zha', 诈: 'zha', 摘: 'zhai', 宅: 'zhai', 窄: 'zhai', 债: 'zhai', 寨: 'zhai', 沾: 'zhan', 粘: 'zhan', 詹: 'zhan', 斩: 'zhan', 展: 'zhan', 占: 'zhan', 战: 'zhan', 站: 'zhan', 张: 'zhang', 章: 'zhang', 彰: 'zhang', 漳: 'zhang', 涨: 'zhang', 掌: 'zhang', 丈: 'zhang', 仗: 'zhang', 帐: 'zhang', 胀: 'zhang', 账: 'zhang', 障: 'zhang', 招: 'zhao', 昭: 'zhao', 找: 'zhao', 召: 'zhao', 兆: 'zhao', 赵: 'zhao', 照: 'zhao', 罩: 'zhao', 遮: 'zhe', 折: 'zhe', 哲: 'zhe', 者: 'zhe', 这: 'zhe', 浙: 'zhe', 针: 'zhen', 侦: 'zhen', 珍: 'zhen', 真: 'zhen', 甄: 'zhen', 诊: 'zhen', 枕: 'zhen', 阵: 'zhen', 振: 'zhen', 镇: 'zhen', 震: 'zhen', 争: 'zheng', 征: 'zheng', 挣: 'zheng', 睁: 'zheng', 蒸: 'zheng', 整: 'zheng', 正: 'zheng', 证: 'zheng', 郑: 'zheng', 政: 'zheng', 症: 'zheng', 之: 'zhi', 支: 'zhi', 汁: 'zhi', 芝: 'zhi', 枝: 'zhi', 知: 'zhi', 织: 'zhi', 脂: 'zhi', 直: 'zhi', 值: 'zhi', 职: 'zhi', 植: 'zhi', 殖: 'zhi', 执: 'zhi', 止: 'zhi', 只: 'zhi', 旨: 'zhi', 纸: 'zhi', 指: 'zhi', 趾: 'zhi', 至: 'zhi', 志: 'zhi', 制: 'zhi', 治: 'zhi', 质: 'zhi', 智: 'zhi', 置: 'zhi', 中: 'zhong', 忠: 'zhong', 终: 'zhong', 钟: 'zhong', 衷: 'zhong', 肿: 'zhong', 种: 'zhong', 仲: 'zhong', 众: 'zhong', 重: 'zhong', 州: 'zhou', 舟: 'zhou', 周: 'zhou', 洲: 'zhou', 轴: 'zhou', 宙: 'zhou', 皱: 'zhou', 骤: 'zhou', 朱: 'zhu', 珠: 'zhu', 株: 'zhu', 诸: 'zhu', 猪: 'zhu', 蛛: 'zhu', 竹: 'zhu', 烛: 'zhu', 逐: 'zhu', 主: 'zhu', 煮: 'zhu', 嘱: 'zhu', 住: 'zhu', 助: 'zhu', 注: 'zhu', 贮: 'zhu', 驻: 'zhu', 柱: 'zhu', 祝: 'zhu', 著: 'zhu', 筑: 'zhu', 抓: 'zhua', 爪: 'zhua', 专: 'zhuan', 砖: 'zhuan', 转: 'zhuan', 赚: 'zhuan', 庄: 'zhuang', 装: 'zhuang', 壮: 'zhuang', 状: 'zhuang', 撞: 'zhuang', 追: 'zhui', 坠: 'zhui', 缀: 'zhui', 赘: 'zhui', 准: 'zhun', 捉: 'zhuo', 桌: 'zhuo', 着: 'zhuo', 卓: 'zhuo', 浊: 'zhuo', 酌: 'zhuo', 啄: 'zhuo', 琢: 'zhuo', 姿: 'zi', 资: 'zi', 滋: 'zi', 子: 'zi', 紫: 'zi', 字: 'zi', 自: 'zi', 宗: 'zong', 综: 'zong', 棕: 'zong', 踪: 'zong', 总: 'zong', 纵: 'zong', 走: 'zou', 奏: 'zou', 租: 'zu', 足: 'zu', 族: 'zu', 阻: 'zu', 组: 'zu', 祖: 'zu', 钻: 'zuan', 嘴: 'zui', 最: 'zui', 罪: 'zui', 醉: 'zui', 尊: 'zun', 遵: 'zun', 昨: 'zuo', 左: 'zuo', 作: 'zuo', 坐: 'zuo', 座: 'zuo', 做: 'zuo'
};

/**
 * 拼音首字母回退表：每个字母对应若干汉字（未命中全拼字典时用）
 * 覆盖常用姓氏与名字用字首字母。
 */
const INITIAL_GROUPS = {
  a: '阿啊哀唉埃挨哎癌矮艾爱碍安氨俺岸按案肮昂盎凹敖熬翱袄傲奥澳',
  b: '八巴扒叭吧疤拔跋把靶坝爸罢霸白百柏摆拜败班般颁斑搬板版办半伴扮瓣邦帮绑榜傍棒包胞褒雹宝饱保堡报抱豹暴爆杯卑悲碑北贝备背倍被辈奔本笨崩绷甭泵蹦逼鼻比彼笔鄙币必毕闭庇毙痹碧蔽壁避臂边编鞭贬扁变便遍辨辩辫标彪膘表鳖别瘪宾彬斌濒滨鬓冰兵丙柄秉饼并病拨波玻剥播伯驳泊勃脖博搏薄跛簸擘卜补捕不布步怖部簿',
  c: '擦猜才材财裁采彩睬踩菜蔡参餐残蚕惭惨灿仓苍沧舱藏操糙曹槽草册侧测策层曾叉插查茶察岔差拆柴豺搀掺蝉馋缠产阐颤昌猖场肠尝常偿厂敞畅倡唱抄超巢朝潮吵炒车扯彻撤尘臣辰沉陈晨衬称趁撑成呈承诚城乘惩程澄橙逞骋秤吃痴持池迟驰耻齿斥赤炽充冲虫崇宠抽仇绸愁筹酬丑瞅臭出初除厨锄雏橱楚础储处触揣川穿传船喘串疮窗床闯创吹炊垂锤春纯唇淳蠢戳词慈辞磁此次刺从匆葱聪丛凑粗促醋簇窜篡崔催脆粹翠村存寸磋搓撮挫措错',
  d: '搭达答打大呆歹戴带殆贷待怠逮丹单担耽胆旦但诞弹淡蛋当挡党荡刀导岛倒蹈到悼盗道稻得德的灯登等邓凳瞪低堤滴迪敌笛嫡底抵地弟帝递第颠典点电店垫殿叼雕吊钓调掉爹跌叠蝶丁叮盯钉顶订定丢东冬董懂动冻洞都斗抖陡豆督毒读独堵赌杜肚度渡端短段断缎堆队对兑吨敦蹲盾遁钝顿多夺朵躲剁惰堕',
  e: '讹俄娥鹅蛾额恶饿鄂遏恩儿而尔耳二贰',
  f: '发乏伐罚阀筏法帆番翻凡烦樊繁反返犯饭泛范贩芳方防妨房肪仿访纺放飞非啡菲肥匪诽吠废沸肺费分吩纷芬坟焚粉份奋愤粪丰风封疯峰锋蜂冯逢缝讽凤奉佛否夫肤孵弗伏扶服浮符幅福辐蝠抚府斧俯釜辅腐父付妇负附咐阜复赴副傅富赋腹覆',
  g: '嘎该改钙盖溉干甘杆肝赶秆敢感赣冈刚岗纲缸钢港高膏篙糕搞稿告戈哥胳鸽割搁歌阁革格葛隔个各给根跟更耕庚羹埂耿梗工弓公功攻供宫恭躬巩汞拱共贡勾沟钩狗构购够估咕姑孤菇古谷股骨鼓固故顾雇瓜刮挂乖拐怪关观官冠馆管贯惯灌罐光广逛归圭龟规闺硅轨鬼诡癸柜刽贵桂跪滚棍锅国果裹过',
  h: '哈孩骸海害含邯函寒韩罕喊汉汗旱悍捍焊航毫豪嚎好号浩耗呵喝合何和河核荷盒贺褐赫鹤黑痕很狠恨哼亨横衡轰哄烘红宏洪虹鸿侯喉猴吼后厚候乎呼忽狐胡壶湖葫糊蝴虎唬互户护沪花华哗滑猾化划画话桦怀淮坏欢还环桓缓幻唤换患痪豢荒慌皇黄煌凰蝗簧恍晃谎灰恢挥辉徽回毁悔卉汇会讳诲绘贿彗慧秽惠昏婚浑魂混活火伙或货获祸惑霍击',
  j: '讥饥圾机肌鸡积基绩缉畸箕稽激及吉汲级即极急疾集嫉籍几己挤脊计记纪忌技际剂季既济继寂寄加夹佳家嘉甲贾钾价驾架假嫁稼歼坚间肩奸兼监笺煎拣俭柬茧检减剪简碱见件建剑健舰渐溅践鉴键箭江姜将浆僵疆讲奖桨蒋匠降蕉椒礁焦角狡绞饺脚铰搅剿缴叫轿较教阶皆接揭街节劫杰洁结捷睫截竭姐解介戒届界借巾今斤金津筋襟仅紧锦谨尽劲近进晋浸禁京经茎惊晶睛精鲸井颈景警净径竞竟敬靖境静镜纠究九久灸玖韭酒旧救就舅居拘狙驹局菊橘咀沮举矩句巨拒具炬俱剧据距惧锯聚娟捐鹃卷倦绢决诀抉掘爵倔蕨倔军君均钧菌俊峻骏竣',
  k: '咔咖卡开揩凯慨刊堪勘坎砍看康慷糠扛抗炕考烤靠苛科棵颗磕壳咳可渴克刻客课肯垦恳坑空孔恐控抠口扣寇枯哭窟苦库裤酷夸垮挎跨块快宽款匡筐狂况旷矿框眶亏盔窥葵魁傀愧溃坤昆捆困扩括阔廓',
  l: '垃拉啦喇腊蜡辣来莱赖兰拦栏婪蓝阑澜览揽缆懒烂滥郎狼廊朗浪捞劳牢老姥涝乐勒雷镭垒磊蕾儡肋泪类累棱冷愣哩梨犁黎离漓篱狸礼李里俚理鲤力历厉立吏丽利励例隶粒俩连帘怜莲联廉镰敛脸练炼恋链良凉梁粮梁两边亮谅辆量辽疗僚潦燎料列劣烈猎裂邻林临淋琳鳞凛吝拎伶灵玲凌铃陵零龄岭领令另溜刘流留琉硫瘤柳六龙咙笼隆垄拢娄楼搂篓陋漏芦卢庐炉颅卤虏鲁陆录赂鹿禄路戮驴吕侣旅履律虑率绿孪峦挛卵乱掠略抡仑伦沦轮论罗萝逻锣箩骡螺裸洛络骆落',
  m: '妈麻蟆马玛码蚂骂吗嘛埋买迈麦卖脉蛮馒瞒满曼慢漫芒忙盲茫莽猫毛矛茅锚卯冒贸帽貌么玫枚眉梅媒煤霉每美镁妹门闷们萌盟檬猛蒙锰孟梦眯弥迷谜米眯泌秘密蜜眠绵棉免勉娩冕面苗描秒渺妙庙灭民敏名明鸣铭命谬摸模膜摩磨蘑魔抹末沫陌莫寞墨默谋某母亩牡拇木目牧墓幕慕暮穆',
  n: '拿哪呐纳娜钠乃奶奈耐男南难囊挠恼脑闹呢内嫩能尼泥你拟逆溺年粘念娘酿鸟尿捏您宁拧凝牛扭纽农浓弄奴努怒女暖虐挪诺',
  o: '哦欧鸥殴呕偶藕',
  p: '趴啪爬帕怕拍排牌派攀盘磐盼畔判叛乓庞旁胖抛刨炮跑泡胚陪培赔佩配喷盆抨烹朋棚蓬鹏澎篷膨捧碰批披砒霹皮疲啤脾匹痞僻屁譬片偏篇骗漂飘瓢票拼贫频品聘乒平评凭屏瓶萍坡泼颇婆迫破魄剖仆扑铺葡菩朴圃浦普谱瀑',
  q: '七沏妻柒凄栖戚期欺漆齐其奇歧祈脐崎骑棋旗企岂启起绮气弃汽契砌器掐恰千仟扦迁牵铅谦签前钱钳潜黔浅遣欠枪呛腔强墙抢悄敲锹乔侨桥瞧巧切茄且窃钦侵亲秦琴禽勤青轻倾清蜻情晴擎顷请庆穷琼丘秋蚯求囚酋球区曲驱屈趋渠取娶去趣圈全权泉拳犬劝券缺瘸却确鹊裙群',
  r: '然燃染嚷壤让饶扰绕惹热人仁忍刃认任纫扔仍日戎荣绒容熔融柔揉肉如儒蠕乳辱入软阮蕊瑞锐闰润若弱',
  s: '撒洒萨腮塞赛三叁伞散桑嗓丧搔骚扫嫂色涩森僧杀沙纱砂傻啥煞筛晒山删杉衫煽珊闪陕扇善伤商赏晌上尚梢烧稍勺韶少绍哨奢赊蛇舍设社射涉赦摄申伸身呻绅深神沈审婶肾甚渗慎升生声牲胜笙绳省圣盛剩尸失师虱诗施狮湿十什石时识实拾蚀食史使始驶士氏世仕市示式事侍势视试饰室是适逝释收手守首寿受授售兽瘦书抒枢叔殊梳淑疏输蔬孰熟暑署蜀鼠薯曙术戍束述树竖恕庶数刷耍衰摔甩帅栓拴双霜爽谁水税睡吮顺舜瞬说烁朔硕丝司私思斯撕嘶死巳四寺似伺饲松耸怂颂送宋讼诵搜艘嗽苏酥俗诉肃素速宿塑酸蒜算虽隋随髓岁祟遂碎穗孙损笋缩所索锁',
  t: '他它她塌塔獭挞踏胎台抬邰苔太态汰泰贪摊滩瘫坛昙谈覃痰谭潭坦袒叹炭探汤唐堂棠塘糖躺淌趟烫涛绦掏逃桃陶萄淘讨套特腾疼誊藤剔梯踢啼提题蹄体替嚏天添田甜填挑条迢跳贴铁帖厅听烃廷亭庭停挺艇通同桐铜童瞳统捅桶筒痛偷头投透凸秃突图徒涂途屠土吐兔湍团推颓腿退吞屯臀托拖脱驼妥拓唾',
  w: '挖哇蛙娃瓦袜歪外弯湾丸完玩顽挽晚碗万汪亡王网往妄忘旺望危威微为围违桅唯惟维伟伪尾纬委萎卫未位味畏胃尉遗魏温文纹闻蚊吻稳问翁嗡窝我沃卧握乌污巫鸣屋无吴吾芜梧五午伍武侮舞兀勿务物悟雾勿',
  x: '夕西吸希昔析矽息牺悉惜晰犀稀溪锡熄熙嘻膝习席袭媳洗喜戏系细隙虾瞎匣侠峡狭暇辖霞下吓夏厦仙先纤掀鲜闲弦贤咸涎衔嫌显险县现线限宪陷馅羡献腺乡相香厢湘箱详祥翔享响想向巷项象像橡削消宵萧硝销霄嚣小晓孝肖效校笑些楔歇协邪胁挟斜谐携鞋写泄泻卸屑械谢蟹心辛欣新薪信衅兴星腥刑行形邢型醒杏姓幸性凶兄匈胸雄熊休修羞朽秀袖绣锈吁须虚需徐许旭序叙恤畜绪续絮蓄宣喧玄悬旋选癣绚眩靴穴学雪血勋熏寻巡询循训讯迅逊殉',
  y: '压呀押鸦鸭牙芽崖哑雅亚咽烟淹焉阉延严言妍岩炎沿研盐阎颜檐奄掩眼演厌宴艳验谚焰雁燕央殃秧扬羊阳杨佯疡洋仰养氧痒样漾夭妖腰邀姚窑谣摇遥咬舀药要耀爷也冶野业叶页夜液一伊衣医依仪夷宜怡贻移遗疑乙已以矣蚁倚椅义亿忆艺议亦异役抑译易诣益谊意溢毅翼因阴音姻银淫尹引饮隐印英婴缨樱鹰迎盈莹萤营蝇赢影映硬哟拥佣庸永泳勇涌用优忧悠幽尤由犹邮油游友有酉又右幼诱于予余鱼娱渔愉愚榆舆与屿宇羽雨语玉吁育郁狱浴预域欲喻寓御裕遇誉豫元员园原圆袁援缘源猿远怨院愿曰约月岳钥悦阅跃越云匀允孕运酝韵蕴',
  z: '匝砸杂灾栽宰载再在咱暂赞赃脏葬遭糟凿早枣澡藻灶皂造噪燥则择泽责贼怎增憎赠扎喳渣札轧闸眨炸诈摘斋宅窄债寨沾粘毡詹斩展盏崭占战站张章彰漳涨掌丈仗帐胀账障招昭找沼赵照罩遮折哲辙者这蔗浙针侦珍真斟甄诊枕阵振镇震争征挣睁蒸整正证郑政症之支汁芝枝知织脂蜘执直值职植殖止只旨纸指趾至志制治质致智置中忠终钟衷肿种仲众重舟州周洲粥轴宙昼皱骤朱株珠诸猪蛛竹烛逐主煮嘱住助注贮驻柱祝著筑抓爪专砖转赚庄桩装壮状撞追坠缀赘准捉桌着拙卓浊酌啄琢姿资滋籽子紫字自宗综棕踪总纵走奏租足族阻组祖钻嘴最罪醉尊遵昨左作坐座做'
};

function isCjkChar(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

function getPinyinInitial(ch) {
  if (!ch) return '';
  if (/[A-Za-z]/.test(ch)) return ch.toLowerCase();
  const full = CHAR_PINYIN[ch];
  if (full) return full.charAt(0);
  const keys = Object.keys(INITIAL_GROUPS);
  for (let i = 0; i < keys.length; i++) {
    const letter = keys[i];
    if (INITIAL_GROUPS[letter].indexOf(ch) >= 0) return letter;
  }
  return '';
}

/**
 * 中文转拼音（小写无音调）。未收录字回退为首字母。
 */
function chineseToPinyin(text) {
  const s = String(text || '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (/[A-Za-z0-9]/.test(ch)) {
      out += ch.toLowerCase();
      continue;
    }
    if (CHAR_PINYIN[ch]) {
      out += CHAR_PINYIN[ch];
      continue;
    }
    if (isCjkChar(ch)) {
      const initial = getPinyinInitial(ch);
      out += initial || 'z';
      continue;
    }
    // 忽略空白；其它符号跳过（不进 sortKey 主体）
    if (/\s/.test(ch)) continue;
  }
  return out;
}

module.exports = {
  CHAR_PINYIN: CHAR_PINYIN,
  isCjkChar: isCjkChar,
  getPinyinInitial: getPinyinInitial,
  chineseToPinyin: chineseToPinyin
};
