# WeQ 装扮离线索引

独立分发 WeQ 使用的气泡、字体与头像挂件离线索引。完整数据通过 Release 附件分发，不进入 Git 历史。

本仓维护发布工具、格式契约和测试；不保存 QQ 账号、凭据或用户聊天内容。

## 格式与兼容

索引只记录装扮 ID、部件名、CDN 路径和大小，不包含完整素材。沿用 `NTDR` v1（protobuf 记录流、Brotli 压缩、AES-CBC），`nativeCommit` 表示配套密钥来源。WeQ 的统一增强包检查器发现已发布描述，检查最低 WeQ 版本及 native 身份后固定明确 tag 下载，不混用不匹配的 native。

Release 包含三份 `dress-{bubble,font,widget}.dat`、`index-manifest.json`、统一描述 `enhancement-pack.json` 和 `SHA256SUMS`。统一描述记录内容 SHA-256、`minWeqVersion`、运行接口及索引清单；内容身份不包含 tag 或下载地址。Git 不接纳 `.dat` 与原始 `*_resources`。

## 本地验证

```sh
node --test test/*.test.mjs
gh release download <明确 native tag> --repo weq-devs/nt_helper_release \
  --pattern manifest.json --pattern 'dress-*.dat' --dir .cache/native
node scripts/stage-release.mjs --native-manifest .cache/native/manifest.json \
  --assets .cache/native --output dist --min-weq-version 2.7.0
```

汇总器验证完整 commit、密钥标识、三类资产的名称、格式头、体积和 SHA-256，拒绝链接和已有输出目录。它只原样分发已验证资源，不重新爬取、压缩或加密。

## 发布

手动运行 `Release dress indexes`，填写明确 native tag。默认只预检；关闭 `preflight_only` 才创建新 Release。现阶段更新数据仍先沿用 native 发布生成兼容资源，再在这里独立分发；资源构建与 native commit 的彻底解耦另行迁移。

`min_weq_version` 填写已验证的最早兼容版本，默认基线为 2.7.0；只更新数据而接口仍兼容时保持原值，不复制本次应用版本。最低版本不替代 native 密钥检查。发布过程不覆盖既有版本，五个清单／数据附件全部校验后才公开。

客户端下载按类别进行，三类文件不再默认进入安装包。已下载素材继续从共享缓存读取，索引更新不会清除用户现有气泡、字体或挂件。
