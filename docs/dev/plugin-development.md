# 插件开发

修仙世界服务端支持插件系统，允许开发者扩展游戏功能而无需修改核心代码。

## 插件架构

```
服务器核心 (Core)
    ├── 插件管理器 (PluginManager)
    │       ├── 加载插件
    │       ├── 卸载插件
    │       └── 管理插件生命周期
    │
    └── 事件系统 (EventBus)
            ├── 注册事件监听器
            ├── 触发事件
            └── 处理事件响应
```

---

## 创建插件

### 1. 创建 Maven 项目

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>com.example</groupId>
    <artifactId>my-plugin</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    
    <dependencies>
        <dependency>
            <groupId>com.mtxgdn</groupId>
            <artifactId>xiuxian-server-api</artifactId>
            <version>1.0.0</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>
</project>
```

### 2. 创建插件主类

```java
import com.mtxgdn.plugin.Plugin;
import com.mtxgdn.plugin.annotation.PluginInfo;

@PluginInfo(
    name = "MyPlugin",
    version = "1.0.0",
    description = "示例插件",
    author = "Your Name",
    dependencies = {"core"}
)
public class MyPlugin extends Plugin {
    
    @Override
    public void onEnable() {
        // 插件启用时执行
        getLogger().info("MyPlugin 已启用");
    }
    
    @Override
    public void onDisable() {
        // 插件禁用时执行
        getLogger().info("MyPlugin 已禁用");
    }
}
```

### 3. 创建插件配置

在 `resources` 目录下创建 `plugin.yml`：

```yaml
name: MyPlugin
version: 1.0.0
description: 示例插件
author: Your Name
main: com.example.MyPlugin
dependencies:
  - core
```

---

## 插件 API

### 基础 API

```java
// 获取日志记录器
getLogger().info("消息");
getLogger().warn("警告");
getLogger().error("错误");

// 获取配置
String value = getConfig().getString("key");

// 保存配置
getConfig().set("key", "value");
saveConfig();

// 获取服务器实例
Server server = getServer();
```

### 注册命令

```java
@Override
public void onEnable() {
    getCommandManager().registerCommand("mycommand", new MyCommand(this));
}
```

命令类示例：

```java
import com.mtxgdn.command.Command;
import com.mtxgdn.command.CommandContext;

public class MyCommand implements Command {
    
    private final MyPlugin plugin;
    
    public MyCommand(MyPlugin plugin) {
        this.plugin = plugin;
    }
    
    @Override
    public String getName() {
        return "mycommand";
    }
    
    @Override
    public String getDescription() {
        return "示例命令";
    }
    
    @Override
    public String getUsage() {
        return "/mycommand [参数]";
    }
    
    @Override
    public void execute(CommandContext context) {
        Player player = context.getPlayer();
        String arg = context.getArgument(0);
        
        player.sendMessage("你执行了命令: " + arg);
    }
}
```

### 注册事件监听器

```java
@Override
public void onEnable() {
    getEventBus().registerListener(PlayerJoinEvent.class, this::onPlayerJoin);
    getEventBus().registerListener(PlayerQuitEvent.class, this::onPlayerQuit);
}

private void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    getLogger().info(player.getName() + " 加入了游戏");
}

private void onPlayerQuit(PlayerQuitEvent event) {
    Player player = event.getPlayer();
    getLogger().info(player.getName() + " 离开了游戏");
}
```

---

## 事件系统

### 可用事件

| 事件类 | 说明 |
|--------|------|
| `PlayerJoinEvent` | 玩家加入游戏 |
| `PlayerQuitEvent` | 玩家离开游戏 |
| `PlayerCreateEvent` | 玩家创建角色 |
| `PlayerLevelUpEvent` | 玩家升级 |
| `PlayerBreakthroughEvent` | 玩家突破境界 |
| `PlayerCultivateEvent` | 玩家开始/停止修炼 |
| `PlayerExploreEvent` | 玩家探索 |
| `PlayerCombatEvent` | 玩家战斗 |
| `PlayerChatEvent` | 玩家聊天 |
| `PlayerTradeEvent` | 玩家交易 |
| `PlayerFriendAddEvent` | 玩家添加好友 |
| `PlayerSectJoinEvent` | 玩家加入宗门 |
| `PlayerItemUseEvent` | 玩家使用物品 |
| `PlayerEquipmentEquipEvent` | 玩家装备物品 |

### 创建自定义事件

```java
import com.mtxgdn.event.Event;

public class CustomEvent extends Event {
    
    private final String data;
    
    public CustomEvent(String data) {
        this.data = data;
    }
    
    public String getData() {
        return data;
    }
}
```

触发事件：

```java
getEventBus().fire(new CustomEvent("自定义数据"));
```

---

## 数据存储

### 使用 SQLite

```java
// 获取数据库连接
Connection conn = getDatabase().getConnection();

// 创建表
String sql = "CREATE TABLE IF NOT EXISTS my_table (id INTEGER PRIMARY KEY, name TEXT)";
try (Statement stmt = conn.createStatement()) {
    stmt.execute(sql);
}

// 插入数据
sql = "INSERT INTO my_table (name) VALUES (?)";
try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
    pstmt.setString(1, "test");
    pstmt.executeUpdate();
}

// 查询数据
sql = "SELECT * FROM my_table";
try (Statement stmt = conn.createStatement();
     ResultSet rs = stmt.executeQuery(sql)) {
    while (rs.next()) {
        System.out.println(rs.getString("name"));
    }
}
```

### 使用 Redis

```java
// 获取 Redis 客户端
RedisClient redis = getRedis();

// 设置键值
redis.set("key", "value");

// 获取值
String value = redis.get("key");

// 设置过期时间
redis.setex("key", 3600, "value");

// 发布消息
redis.publish("channel", "message");

// 订阅消息
redis.subscribe("channel", message -> {
    getLogger().info("收到消息: " + message);
});
```

---

## HTTP API

### 注册 HTTP 端点

```java
@Override
public void onEnable() {
    getHttpServer().registerEndpoint("/api/myplugin/status", this::getStatus);
}

private ApiResponse getStatus(HttpRequest request) {
    return ApiResponse.success("MyPlugin is running");
}
```

### HTTP 请求处理

```java
private ApiResponse handleRequest(HttpRequest request) {
    // 获取请求参数
    String param = request.getParameter("param");
    
    // 获取请求体
    String body = request.getBody();
    
    // 获取请求头
    String token = request.getHeader("Authorization");
    
    // 返回响应
    return ApiResponse.success("处理成功");
}
```

---

## 插件依赖

### 声明依赖

```yaml
name: MyPlugin
version: 1.0.0
dependencies:
  - core
  - economy
```

### 检查依赖

```java
@Override
public void onEnable() {
    if (!getPluginManager().isPluginEnabled("economy")) {
        getLogger().error("缺少 economy 插件依赖");
        getServer().disablePlugin(this);
        return;
    }
    
    EconomyPlugin economy = (EconomyPlugin) getPluginManager().getPlugin("economy");
    economy.addCoins(playerId, 100);
}
```

---

## 插件生命周期

| 阶段 | 方法 | 说明 |
|------|------|------|
| 加载 | `onLoad()` | 插件加载时调用，此时其他插件可能未加载 |
| 启用 | `onEnable()` | 插件启用时调用，所有依赖已加载 |
| 禁用 | `onDisable()` | 插件禁用时调用，清理资源 |
| 卸载 | `onUnload()` | 插件卸载时调用 |

---

## 插件打包

### 构建 JAR

```bash
mvn clean package
```

生成的 JAR 文件位于 `target/my-plugin-1.0.0.jar`。

### 安装插件

将 JAR 文件复制到服务器的 `plugins/` 目录，服务器启动时会自动加载。

---

## 调试插件

### 日志调试

```java
getLogger().info("调试信息");
getLogger().debug("详细调试");
```

### 远程调试

修改启动脚本，添加调试参数：

```bash
java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005 -jar xiuxian-server-1.0.0.jar
```

然后在 IDE 中配置远程调试连接到 `localhost:5005`。

---

## 插件示例

### 完整插件示例

```java
import com.mtxgdn.plugin.Plugin;
import com.mtxgdn.plugin.annotation.PluginInfo;
import com.mtxgdn.event.PlayerJoinEvent;
import com.mtxgdn.command.Command;
import com.mtxgdn.command.CommandContext;

@PluginInfo(
    name = "WelcomePlugin",
    version = "1.0.0",
    description = "欢迎插件",
    author = "Developer"
)
public class WelcomePlugin extends Plugin {
    
    @Override
    public void onEnable() {
        getLogger().info("欢迎插件已启用");
        
        // 注册事件监听器
        getEventBus().registerListener(PlayerJoinEvent.class, this::onPlayerJoin);
        
        // 注册命令
        getCommandManager().registerCommand("welcome", new WelcomeCommand(this));
    }
    
    @Override
    public void onDisable() {
        getLogger().info("欢迎插件已禁用");
    }
    
    private void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        player.sendMessage("欢迎来到修仙世界！");
        
        // 发送广播
        getServer().broadcastMessage(player.getName() + " 加入了游戏");
    }
    
    private class WelcomeCommand implements Command {
        private final WelcomePlugin plugin;
        
        public WelcomeCommand(WelcomePlugin plugin) {
            this.plugin = plugin;
        }
        
        @Override
        public String getName() { return "welcome"; }
        
        @Override
        public String getDescription() { return "发送欢迎消息"; }
        
        @Override
        public void execute(CommandContext context) {
            Player player = context.getPlayer();
            player.sendMessage("🎉 欢迎！");
        }
    }
}
```

---

## 注意事项

1. **线程安全**：插件代码可能在多个线程中执行，注意线程安全
2. **资源清理**：在 `onDisable()` 中清理所有资源（数据库连接、线程等）
3. **异常处理**：捕获所有异常，避免插件崩溃影响服务器
4. **性能考虑**：避免在事件处理中执行耗时操作
5. **API 兼容性**：使用稳定的 API，避免使用内部类和方法
6. **配置管理**：使用 `getConfig()` 管理配置，不要硬编码