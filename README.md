# WeQ 资源增强包

这里分发气泡、字体与头像挂件的离线索引，以及商城表情目录。WeQ 从 `weq-resource-feed/update-index.json` 读取同一份签名索引，按包发现和安装更新。

## 两包的数据来源

- **装扮离线索引** 由维护者在已登录 QQ 的环境采集三份 `*_resources`，存入私有 `weq-devs/nt_helper`。统一工作流读取明确的私有仓提交，将记录压缩并加密成 `dress-*.dat`，生成 `enhancement-dress-v2.json`，发布为 `dress-index-*`。清单的 `keyId` 对应客户端 native 中已内置的密钥，持续采集可独立发布。
- **商城表情目录** 使用 `market.csv.gz` 和 `enhancement-market-emoji.json`，发布为 `market-emoji-*`。首次从仓内的 `resources/market-seed.csv.gz` 开始，后续读取最新签名索引并下载已校验的目录，然后从实际最大包 ID 继续采集。原始工作 CSV 放在 `.cache/`。

## 预检与发布

在 Actions 手动运行 **Release resource enhancements**，选择 `both`、`dress` 或 `market-emoji`。包含装扮时填入私有仓的采集快照完整 SHA，包含表情时可用 `refresh_market` 决定是否继续采集。最低 WeQ 版本默认 2.8.0。默认开启 `preflight_only`。

本地可用测试密钥验证格式。以下命令使用本机采集目录和仓内首次表情快照：

```sh
node --test test/*.test.mjs
node scripts/prepare-market-source.mjs --output .cache/market.csv
mkdir -p dist
node scripts/stage-market-emoji.mjs --csv .cache/market.csv --output dist/market-emoji --min-weq-version 2.8.0
node scripts/stage-dress-index.mjs --source ../nt_helper/resources/dress --output dist/dress --min-weq-version 2.8.0
```

装扮暂存命令读取环境变量 `WEQ_DRESS_ENCRYPTION_KEY`。正式工作流的同名密钥须与已发布 native 的 `WEQ_DRESS_KEYS` 中一把密钥对应，另需配置可只读检出私有快照的 `NT_HELPER_TOKEN`。发布两包均使用已配置的 `WEQ_RELEASE_SIGNING_KEY`，签名工具取 WeQ `dev`，单次资源更新无需提交 WeQ 源码。工作流上传选定的附件后更新签名索引，未选中的包继续指向自己的上一版。相同输入的 Release 可复用，签名索引发布失败可以重跑。

## 旧客户端

**Release dress indexes** 继续提供 2.7.x 使用的 NTDR v1。它读取明确 native tag 下的三份 `dress-*.dat`，校验后发布 `index-manifest.json` 和 `enhancement-pack.json`，并更新原来的 `weq-update-feed`。旧包的 `nativeCommit` 仍与原生密钥配套。新工作流发布的资源不占用旧装扮 Release 的 Latest 位置。
