# 云端集成测试清单（需真机/开发者工具云环境）

本机自动测试见 `scripts/teamClub.cloud.selftest.js`（MemoryStore）。下列项必须在已上传 `teamClub` 云函数、已建集合后于开发者工具执行，**当前仓库运行并未部署成功**。

- [ ] OPENID 身份不可伪造（改请求 userId 无效）
- [ ] 客户端伪造 role/ownerUserId 无效
- [ ] 创建唯一 superAdmin
- [ ] 管理员审批同意/拒绝
- [ ] 普通成员越权拒绝
- [ ] 并发审批只成功一次
- [ ] 唯一队长
- [ ] 转让所有权
- [ ] 邀请 token 仅创建时返回；库中仅 hash；过期/撤销
- [ ] 解散后拒绝写入
- [ ] version 冲突
- [ ] 重试幂等
- [ ] 云失败页面显示网络错误，不出现本地旧球队
- [ ] 多球队不串数据
- [ ] 迁移不导入 mock 1–5
- [ ] 云函数日志无 token/OPENID/手机号
