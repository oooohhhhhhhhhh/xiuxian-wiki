# 插件开发

修仙世界提供完整的插件系统，支持自定义命令、物品、游历事件和秘境。

## 插件结构

### 基本结构

```
plugin/
├── plugin.json          # 插件元数据
├── pom.xml              # Maven 配置
└── src/
    └── main/
        ├── java/
        │   └── YourPlugin.java    # 插件主类
        └── resources/
            └── plugin.properties  # 插件配置
```

### plugin.json 示例

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "这是一个示例插件",
  "author": "作者名",
  "mainClass": "com.example.MyPlugin"
}
```

## 插件生命周期

### 生命周期方法

| 方法 | 调用时机 | 说明 |
|------|----------|------|
| `onLoad()` | 插件加载时 | 初始化资源 |
| `onEnable()` | 插件启用时 | 注册命令、物品等 |
| `onDisable()` | 插件禁用时 | 清理资源 |

### 示例代码

```java
public class MyPlugin extends Plugin {
    
    @Override
    public void onLoad() {
        // 加载配置文件
    }
    
    @Override
    public void onEnable() {
        // 注册命令
        registerCommand("mycmd", new MyCommand());
        
        // 注册物品
        registerItem(new MyItem());
        
        // 注册游历事件
        registerExplorationEvent(new MyEvent());
    }
    
    @Override
    public void onDisable() {
        // 清理资源
    }
}
```

## 注册命令

### 命令类示例

```java
public class MyCommand extends Command {
    
    public MyCommand() {
        super("mycmd", "我的命令", "game.mycmd.use");
    }
    
    @Override
    public void execute(CommandContext ctx) {
        ctx.reply("这是我的命令！");
    }
}
```

### 注册命令

```java
registerCommand("mycmd", new MyCommand());
```

## 注册物品

### 物品类示例

```java
public class MyItem extends Item {
    
    public MyItem() {
        super("my_item", "我的物品", ItemType.CONSUMABLE, ItemRarity.RARE);
        setEffect(new ExpEffect(1000));
    }
}
```

### 注册物品

```java
registerItem(new MyItem());
```

## 注册游历事件

### 事件类示例

```java
public class MyEvent extends ExplorationEvent {
    
    public MyEvent() {
        super("my_event", "我的事件", 10);
    }
    
    @Override
    public String trigger(Player player) {
        // 触发事件逻辑
        player.addItem("my_item", 1);
        return "你发现了一个神秘的物品！";
    }
}
```

### 注册事件

```java
registerExplorationEvent(new MyEvent());
```

## 插件 API

### 服务访问

插件可以访问所有游戏服务：

```java
PlayerService playerService = getService(PlayerService.class);
ItemService itemService = getService(ItemService.class);
```

### 数据库访问

```java
Connection conn = getDatabaseConnection();
```

### 配置访问

```java
String value = getConfig().getString("key");
```

## 插件热重载

### 命令重载

```
/reloadPlugin <插件ID>
```

### 手动重载

1. 将插件 JAR 文件放入 `plugins/` 目录
2. 使用 `/reloadPlugin` 命令重载

## 示例插件

参考 `examples/sample-plugin/` 目录中的示例插件。