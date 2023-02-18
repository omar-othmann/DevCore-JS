# What is DevCore?
DevCore is a translate library for MySQL database to work with JS classes

* Create JS class as database table
* Set & Get data as JS objects.
* Control your database table from JS class
* Allow you to use custom MySQL commands
* Custom functions and variables in table class
* Stay online with MySQL server


<br>Please open new issue in GitHub if any issue happened with you.

# Required mysql2
* npm install mysql2

# example
Create your own js script file for your database tables.

```js
import { MYSQLConnector, Table } from './DevCore'

export const database = new MYSQLConnector("DevCore", { host: "localhost", user: "root", password: "****" })


export class Users extends Table{
    constructor(){
        super()
        this.id = this.IntField(true) // auto (required) for each table.
        this.username = this.StringField()
        this.password = this.StringField()

        // custom variable allowed!!
        this.online = false
    }

    async All(){
        return await this.execute(`SELECT * FROM ${this.tableName}`).all()
    }
    // custom function allowed!!

    IsOnline(){
        return this.online
    }
}

export class AnotherTable extends Table{
    constructor(){
        super()
        this.id = this.IntField(true) // auto (required) for each table.
        this.username = this.StringField()
        this.password = this.StringField()

        // custom variable allowed!!
    }

    async All(){
        return await this.execute(`SELECT * FROM ${this.tableName}`).all()
    }

    // custom function with MYSQL command!!

    async UpdatePassword(username, newPassword){
        return await this.execute(`UPDATE ${this.tableName} SET password=:pass WHERE username=:user`, {pass: newPassword, user: username}).run()
    }
}

await database.push(Users)
await database.push(AnotherTable)
```

# Main application

```js
import * as core from 'pathToYourTableFile'

// all users empty list or list of core.Users class
let AllUsers = await core.database.select(core.Users).All()

// direct query
let result = await core.database.select(core.Users).where("username").equals("value").first()

// select function is return new paramater class for example
// let users = core.database.select(core.Users) -> return new core.Users

if(result){
    // update password
    result.password = "newPassword"
    await result.update()

    // or delete
    const rowid = await result.delete()
    // call custom functions
    console.log(result.IsOnline())

    // query another from result
    let res = await result.where("username").equals("another").first()
}

// or query with class
let user = new core.Users()
let res = await user.where("username").equals("value").first()
if(res){
    res.password = "newPassword"
    await res.update()
    console.log("User password successfully updated")
}else{
    user.username = "DevCore"
    user.password = "1234"
    const rowid = await user.insert()
    console.log(`user created row id: ${rowid}`)
}
```

# DevCore.MYSQLConnector

| args | default | type | description
--- | --- | --- | ---
host | `None` | `str` | MySQL host ip 
user | `None` | `str` | MySQL username
password | `blank` | `str`|MySQL password
charset | `utf8mb4`| `str`|MySQL database & table charset
collate | `utf8mb4_bin`| `str`|MySQL table collate
dropColumn | `False` | `bool` | drop column if variable not in your class, make sure to set it `False` after start application
addColumn | `False` | `bool` | add column if column not exists in database table and is exists as variable in your class, make sure to set it `False` after start application


<br><br>


# `Table` class + (Your Class)

| functions | args | return | description
--- | ---- | ----| ---- |
| where | variable: `str` | Where `class` | MySQL commands helper
| execute | command: `str`, args: `dict` | execute `class` | execute MySQL command
| update | `None` | `int`: rowcount | update changes to database table
| insert | `None` | `int`: rowcount | insert new to database
| delete | `None` | `int`: deleted row id | delete the row from database table
<br><br>

# (`Table`.`where` function) -> `Where` class
| function | args | return | description | MySQL 
--- | --- | --- | --- | ---
orWherer | variable: `str` | self | `or` operator | `or columnName`
andWhere | variable: `str` | self | `and` operator | `and columnName`
equals | value: `[str, int, float, bool]` | self | `=` operator | `= value`
notEquals | value: `[str, int, float, bool]` | self | `!=` operator |`!= value`
like | value: `[str, int, float, bool]` | self | `LIKE` operator | `LIKE value`
notLike | value: `[str, int, float, bool]` | self | `NOT LIKE` operator |`NOT LIKE value`
moreThan | value: `[int, float]` | self | `>` operator | `> value`
moreThanOrEquals | value: `[int, float]` | self | `>=` operator | `>= value`
lessThan | value: `[int, float]` | self | `<` operator | `< value`
lessThanOrEquals | value: `[int, float]` | self | `<=` operator | `<= value`
notNull | `None` | self | `NOT NULL` operator | `column NOT NULL`
isNull | `None` | self | `IS NULL` operator | `column IS NULL`
iN | `value: tuple` | self | `IN` operator | `IN (element, element1)`
between | value: `[str, int, float, bool]`, value2: `[str, int, float, bool]` | self | `between` operator | `between value and value2`
orderBy | variable: `str`, stuff=`"asc"`, limit=`0` | self | sort by variable `asc` default, limit=`0` unlimited | `ORDER BY variable ASC` or `ORDER BY variable ASC limit number`
first | `None` | Your table class or None | first row from result | `Unknown`
all | `None` | list of your table class or empty list | all row from result | `Unknown`

# (`Table`.`execute` function) -> Execute class

| function | args | return | description
--- | --- | --- | ---
all | `None` | list of your class or `empty list` | execute your command and get result as list of your class
first | `None` | Your class or `None` | execute your command and get first row result as your class or None
run | `None` | `int` last row id or row count | execute your command
<br><br>
# (`Table.Fields` class)

| static method | args | MYSQL | convert
--- | --- | --- | ---
IntField | auto=`False` nullable=`False` | `integer`, auto `AUTO_INCREMENT PRIMARY KEY NOT NULL`, nullable `allow the value be null` | always int
StringField | nullable=`False`, def=`None` | `longtext`, null `allow the value be null`, def `default value` | always str.
FloatField | // | `REAL`, // | auto convert to python `float`
ListField | // | `longtext`, // | auto convert to python `list`
DictField | // | `//`, // | auto convert to python `dict`
BooleanField | // | `//`, // | auto convert to python `boolean`
