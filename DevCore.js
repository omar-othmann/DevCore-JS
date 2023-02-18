import * as MySQL from 'mysql2/promise'


let CONNECTION_WRAPPER = {}

class MySQLField {
    constructor(type = null, auto = false, nullable = false, def = null, name = null) {
        this.type = type
        this.auto = auto
        this.nullable = nullable
        this.def = def
        this.name = name
        if (auto && nullable) {
            console.log("intField can't be auto increment with null value, [auto-editor]: changed nullable value from true to False")
            this.nullable = false
        }
    }

    getType() {
        return typeof this.type
    }

    isNull() {
        return this.nullable
    }

    isAuto() {
        return this.auto
    }

    defValue() {
        return this.def
    }


    toSQL() {

        switch (this.getType()) {
            case "number":
                if (this.type % 1 == 0) {
                    if (this.isAuto()) {
                        return "INT AUTO_INCREMENT PRIMARY KEY NOT NULL"
                    }
                    if (!this.isNull()) {
                        if (this.defValue()) {
                            return `INT NOT NULL DEFAULT ${this.def}`
                        }
                        return "INT NOT NULL"
                    }
                    return "INT"
                } else {
                    if (!this.isNull()) {
                        if (this.defValue()) {
                            return `REAL NOT NULL DEFAULT ${this.def}`
                        }

                        return "REAL NOT NULL"
                    }
                    return "REAL"
                }
            case "string":
            case "object":
                if (!this.isNull()) {
                    if (this.defValue()) {
                        return `LONGTEXT NOT NULL DEFAUTLT ${this.def}`
                    }
                    return "LONGTEXT NOT NULL"
                }
                return "LONGTEXT"
            case "boolean":
                if (!this.isNull()) {
                    if (this.defValue()) {
                        return `BOOLEAN NOT NULL DEFAULT ${this.def}`
                    }
                    return "BOOLEAN NOT NULL"
                }
                return "BOOLEAN"
            default: return null

        }
    }
}


class ConnectionWrapper {
    static GetClass(db, name) {
        if (db in CONNECTION_WRAPPER) {
            const wrapper = CONNECTION_WRAPPER[db]
            if (name in wrapper.classes) {
                return wrapper.classes[name]
            }
        }
        return null
    }

    static GetConnectionByClassName(name) {
        for (const db in CONNECTION_WRAPPER) {
            if (name in CONNECTION_WRAPPER[db].classes) return CONNECTION_WRAPPER[db].connection
        }
        return null
    }

    static AddClass(db, name, cls, connection) {
        if (ConnectionWrapper.GetClass(db, name) == null) {
            if (db in CONNECTION_WRAPPER) {
                CONNECTION_WRAPPER[db].classes[name] = cls
            } else {
                CONNECTION_WRAPPER[db] = {
                    classes: {},
                    connection: connection
                }
                CONNECTION_WRAPPER[db].classes[name] = cls
            }
        }
    }
}

export class MYSQLConnector {
    constructor(name, setup) {
        this.name = name
        this.charset = setup.charset || "utf8mb4"
        this.collate = setup.collate || "utf8mb4_bin"
        this.connection = null
        this.isReady = false
        this.readyCallbacks = []
        this.Connnect(setup)
        this.setup = setup
    }

    async Connnect(setup) {
        this.connection = await MySQL.createConnection(setup);
        await this.connection.query(`CREATE DATABASE IF NOT EXISTS ${this.name} CHARACTER SET ${this.charset} COLLATE ${this.collate};`)
        this.connection.end()
        this.setup.database = this.name
        this.connection = await MySQL.createConnection(this.setup)
        this.connection.on("error", (err) => {
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                this.Connnect()
            } else {
                throw err;
            }
        })
        this.isReady = true
        for (const f of this.readyCallbacks) f()
        this.readyCallbacks = []
    }

    async ready(fun) {
        if (this.isReady) {
            fun()
            return
        }
        this.readyCallbacks.push(fun)
    }


    async waitUntil(cordinate) {
        while (!cordinate()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async SingleQuery(sql) {
        try {
            const [res] = await this.connection.query(sql)
            return res
        } catch (e) {
            console.log(e)
            return null
        }
    }

    async Query(sql, data) {
        try {
            const [res] = await this.connection.query(sql, data)
            return res
        }
        catch (e) {
            console.log(e)
            return null
        }
    }

    select(table){
        return new table()
    }

    async push(table, dropColumn = false, addColumn = false) {
        await this.waitUntil(() => this.isReady)

        const fake = new table()
        ConnectionWrapper.AddClass(this.name, fake.tableName, table, this)
        var SQL = `CREATE TABLE IF NOT EXISTS ${fake.tableName}(`
        const GLOBAL_COLUMNS = []
        for (const key in fake) {
            let value = fake[key]
            if (value instanceof MySQLField) {
                SQL += `${key} ${value.toSQL()}, `
                GLOBAL_COLUMNS.push(key)
            }
        }
        SQL = SQL.substring(0, SQL.length - 2)
        SQL += `) CHARACTER SET ${this.charset} COLLATE ${this.collate};`

        await this.SingleQuery(SQL)
        if (dropColumn || addColumn) {
            const res = await this.SingleQuery(`SHOW COLUMNS FROM ${fake.tableName}`)
            if (res) {
                const arry = []
                for (const d of res) {
                    arry.push(d.Field)
                }
                if (dropColumn) {
                    let filter = arry.filter(item => !GLOBAL_COLUMNS.includes(item))
                    for (const colum of filter) {
                        await this.SingleQuery(`ALTER TABLE ${fake.tableName} DROP COLUMN ${colum};`)
                    }
                }
                if (addColumn) {
                    let filter = GLOBAL_COLUMNS.filter(item => !arry.includes(item))
                    for (const colum of filter) {
                        const value = fake[colum]
                        await this.SingleQuery(`ALTER TABLE ${fake.tableName} ADD COLUMN ${colum} ${value.toSQL()};`)
                    }
                }
            }
        }

    }
}


class Execute{
    constructor(table, command, args){
        this.database = ConnectionWrapper.GetConnectionByClassName(table)
        this.instance = ConnectionWrapper.GetClass(this.database.name, table)
        if (this.instance == null || this.database == null) {
            throw new Error(`There is not database connected to this table, databaseName: ${this.database}, tableName: ${table}`)
        }
        this.fake = new this.instance()
        this.command = command
        this.args = this.#toSQLValues(args)
    }

    async all(){
        let SQL
        let needArgs = true
        if(this.command.includes(":") && this.args){
            SQL = this.toStyle()
            needArgs = false
        }else{
            SQL = this.command
            if(!this.args){
                needArgs = false
            }
        }
        let result
        if(needArgs){
            result = await this.database.Query(SQL, this.args)
        }else{
            result = await this.database.SingleQuery(SQL)
        }
        if (result && result.length > 0) {
            const res = []
            for (const row of result) {
                const obj = new this.instance()
                obj.__allowChangedId = true
                Object.assign(obj, this.#toJs(row))
                obj.__allowChangedId = false
                res.push(obj)
            }
            return res
        }
        return null
    }


    async first(){
        let SQL
        let needArgs = true
        if(this.command.includes(":") && this.args){
            SQL = this.toStyle()
            needArgs = false
        }else{
            SQL = this.command
            if(!this.args){
                needArgs = false
            }
        }
        let result
        if(needArgs){
            result = await this.database.Query(SQL, this.args)
        }else{
            result = await this.database.SingleQuery(SQL)
        }
        if (result && result.length > 0) {
            this.fake.__allowChangedId = true
            Object.assign(this.fake, this.#toJs(result[0]))
            this.fake.__allowChangedId = false
            return this.fake
        }
        return null
    }

    async run(){
        let SQL
        let needArgs = true
        if(this.command.includes(":") && this.args){
            SQL = this.toStyle()
            needArgs = false
        }else{
            SQL = this.command
            if(!this.args){
                needArgs = false
            }
        }
        let result
        if(needArgs){
            result = await this.database.Query(SQL, this.args)
        }else{
            result = await this.database.SingleQuery(SQL)
        }
        return result
    }

    toStyle(){
        let command = this.command
        
        for(const key in this.args){
            command = command.replace(`:${key}`, `${this.args[key]}`)
        }
        return command
    }

    #toJs(res) {
        for (const key in res) {
            if (this.fake[key] instanceof MySQLField) {
                const field = this.fake[key]
                switch (field.name) {
                    case 'int':
                        if (typeof res[key] != "number") {
                            try {
                                res[key] = parseInt(res[key])
                            } catch {
                                res[key] = 0
                            }
                        }
                        break
                    case "float":
                        if (typeof res[key] != "number") {
                            try {
                                res[key] = parseInt(res[key])
                            } catch {
                                res[key] = 0.0
                            }
                        }
                    case "list":
                        try {
                            if (res[key]) {

                                res[key] = JSON.parse(res[key])
                            } else {
                                res[key] = []
                            }
                        } catch {
                            console.error(`error, column ${key} should be list, but i can't change the type to list`)
                        }
                        break
                    case "dict":
                        try {
                            if (res[key]) {
                                res[key] = JSON.parse(res[key])
                            } else {
                                res[key] = {}
                            }
                        } catch {
                            console.error(`error, column ${key} should be dict, but i can't change the type to dict`)
                        }
                        break
                    case "bool":
                        res[key] = res[key] == "true"
                        break
                    default:
                        break
                }
            }
        }
        return res
    }

    #toSQLValues(res){
        let result = {}
        for(const key in res){
            switch(typeof res[key]){
                case "object":
                    result[key] = JSON.stringify(res[key])
                    break
                case "boolean":
                    result[key] = res[key].toString()
                    break
                default:
                    result[key] = res[key]
                    break 
            }
        }
        return result
    }

    
}

class Where {
    constructor(table, variable) {
        this.__database = ConnectionWrapper.GetConnectionByClassName(table)
        this.instance = ConnectionWrapper.GetClass(this.__database.name, table)
        if (this.instance == null || this.__database == null) {
            throw new Error(`There is not database connected to this table, databaseName: ${database}, tableName: ${table}`)
        }
        this.fake = new this.instance()
        this.__table = table
        this.__where = `WHERE ${variable}`
        this.__closed = false
        this.__values = []
        this.__check_variable(variable)
    }

    orWhere(variable) {
        this.__check_variable(variable)
        if (!this.__closed) throw new Error("you can't call orWhere, you should close the first")
        this.__where += ` or ${variable}`
        this.__closed = false
        return this
    }
    andWhere(variable) {
        this.__check_variable(variable)
        if (!this.__closed) throw new Error("you can't call andWhere, you should close the first")
        this.__where += ` and ${variable}`
        this.__closed = false
        return this
    }

    equals(value) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += " = ?"
        this.__closed = true
        this.__values.push(value)
        return this
    }

    notEquals(value) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += " != ?"
        this.__closed = true
        this.__values.push(value)
        return this
    }

    like(value, before = false, after = false) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        if (after && before) {
            this.__where += ` like "%${value}%"`
        } else if (after) {
            this.__where += ` like "${value}%"`
        } else if (before) {
            this.__where += ` like "%${value}"`
        } else {
            this.__where += ` like "${value}"`
        }
        this.__closed = true
        return this
    }

    notLike(value, before = false, after = false) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        if (after && before) {
            this.__where += ` not like "%${value}%"`
        } else if (after) {
            this.__where += ` not like "${value}%"`
        } else if (before) {
            this.__where += ` not like "%${value}"`
        } else {
            this.__where += ` not like "${value}"`
        }
        this.__closed = true
        return this
    }

    moreThan(value) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += ` > ?`
        this.__values.push(value)
        this.__closed = true
        return this
    }

    moreThanOrEquals(value) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += ` >= ?`
        this.__values.push(value)
        this.__closed = true
        return this
    }

    lessThan(value) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += ` < ?`
        this.__values.push(value)
        this.__closed = true
        return this
    }
    lessThanOrEquals(value) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += ` <= ?`
        this.__values.push(value)
        this.__closed = true
        return this
    }

    notNull() {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += " is not null"
        this.__closed = true
        return this
    }

    isNull() {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += " is null"
        this.__closed = true
        return this
    }

    in(value) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += " in ("
        for (const val of value) {
            this.__where += `${val}, `
        }
        this.__where = this.__where.substring(0, this.__where.length - 2) + ")";
        this.__closed = true
        return this
    }

    between(value, value2) {
        if (this.__closed) throw new Error("Please use andWhere or orWhere before you call this function.")
        this.__where += " between ? and ?"
        this.__values.push(value)
        this.__values.push(value2)
        this.__closed = true
        return this
    }

    orderBy(variable, stuff = "asc", limit = 0) {
        this.__check_variable(variable)
        if (limit > 0) {
            this.__where += ` order by ${variable} ${stuff} limit ${limit}`
        } else {
            this.__where += ` order by ${variable} ${stuff}`
        }
        this.__closed = true
        return this
    }

    __check_variable(name) {
        if (!(this.fake[name] instanceof MySQLField)) throw new Error(`variable ${name} is not column, is ignored column. you cann\'t use it with where because is not exists on database.`)
    }

    async all() {
        var SQL = `select * from ${this.fake.tableName} ${this.__where}`
        let result;
        if (this.__values.length > 0) {
            result = await this.__database.Query(SQL, this.__values)
        } else {
            result = await this.__database.SingleQuery(SQL)
        }
        if (result && result.length > 0) {
            const res = []
            for (const row of result) {
                const obj = new this.instance()
                obj.__allowChangedId = true
                Object.assign(obj, this.#toJs(row))
                obj.__allowChangedId = false
                res.push(obj)
            }
            return res
        }
        return null
    }
    async first() {
        var SQL = `select * from ${this.fake.tableName} ${this.__where}`
        let result;
        if (this.__values.length > 0) {
            result = await this.__database.Query(SQL, this.__values)
        } else {
            result = await this.__database.SingleQuery(SQL)
        }
        if (result && result.length > 0) {
            this.fake.__allowChangedId = true
            Object.assign(this.fake, this.#toJs(result[0]))
            this.fake.__allowChangedId = false
            return this.fake
        }
        return null
    }

    #toJs(res) {
        for (const key in res) {
            if (this.fake[key] instanceof MySQLField) {
                const field = this.fake[key]
                switch (field.name) {
                    case 'int':
                        if (typeof res[key] != "number") {
                            try {
                                res[key] = parseInt(res[key])
                            } catch {
                                res[key] = 0
                            }
                        }
                        break
                    case "float":
                        if (typeof res[key] != "number") {
                            try {
                                res[key] = parseInt(res[key])
                            } catch {
                                res[key] = 0.0
                            }
                        }
                    case "list":
                        try {
                            if (res[key]) {

                                res[key] = JSON.parse(res[key])
                            } else {
                                res[key] = []
                            }
                        } catch {
                            console.error(`error, column ${key} should be list, but i can't change the type to list`)
                        }
                        break
                    case "dict":
                        try {
                            if (res[key]) {
                                res[key] = JSON.parse(res[key])
                            } else {
                                res[key] = {}
                            }
                        } catch {
                            console.error(`error, column ${key} should be dict, but i can't change the type to dict`)
                        }
                        break
                    case "bool":
                        res[key] = res[key] == "true"
                        break
                    default:
                        break
                }
            }
        }
        return res
    }

}

export class Table {
    constructor() {
        this.tableName = this.constructor.name
        this.__allowChangedId = false
        this.__updated__ = {}
        this.__auto__field = null
        return new Proxy(this, {
            get: (target, name) => {
                if (target.__updated__[name]) {
                    return target.__updated__[name]
                }
                return target[name]
            },
            set: (target, name, value) => {
                if (!(value instanceof MySQLField) && !name.startsWith("__")) {
                    let field = target[name]
                    if (field && field instanceof MySQLField) {
                        if (field.isAuto() && !this.__allowChangedId) {
                            throw new Error(`Can't change column ${name} to ${value}, because it's auto_increment!`)
                        }
                        let type = typeof value
                        let fieldType = field.getType()
                        if (type != fieldType) {
                            throw new Error(`Type of column ${name} should be ${fieldType}, got ${type}`)
                        } else {
                            if (Array.isArray(field.type) && !Array.isArray(value)) {
                                throw new Error(`Type of column ${name} should be List, got ${type}`)
                            } else if (fieldType == "number" && field.type % 1 == 0 && value % 1 != 0) {
                                throw new Error(`Type of column ${name} should be float, got ${type}`)
                            }
                        }
                        target.__updated__[name] = value
                    }
                } else {
                    target[name] = value
                    if(value.auto){
                        if(target.__auto__field){
                            throw new Error("You can't have 2 or more auto_increment column!")
                        }
                        target.__auto__field = name
                    }
                }
                return target
            }
        })
    }
    StringField(nullable = false, def = null) {
        return new MySQLField("", false, nullable, def, 'string')
    }

    IntField(auto = false, nullable = false, def = null) {
        return new MySQLField(0, auto, nullable, def, 'int')
    }

    BooleanField(nullable = false, def = null) {
        return new MySQLField(true, false, nullable, def, 'bool')
    }

    ListField(nullable = false, def = null) {
        return new MySQLField([], false, nullable, def, 'list')
    }

    DictField(nullable = false, def = null) {
        return new MySQLField({}, false, nullable, def, 'dict')
    }

    FloatField(nullable = false, def = null) {
        return new MySQLField(0, false, nullable, def, 'float')
    }

    where(variable) {
        return new Where(this.tableName, variable)
    }

    execute(command, args=null){
        return new Execute(this.tableName, command, args)
    }

    isResult(){
        return !(this[this.__auto__field] instanceof MySQLField)
    }

    async update(){
        let auto = this.__auto__field
        let value = this[this.__auto__field]
        if(!(value instanceof MySQLField)){
            let database = ConnectionWrapper.GetConnectionByClassName(this.tableName)
            if(!database){
                throw new Error("There is no database connected to this table. did you push the table to database with await?")
            }
            let updated = this.toSQLValues(this.__updated__)
            let SQL = `UPDATE ${this.tableName} SET `
            let values = []
            
            for(const key in updated){
                if(key == auto) continue;
                SQL += `${key} = ?, `
                values.push(updated[key])
            }
            SQL = SQL.substring(0, SQL.length - 2)
            SQL += ` WHERE ${auto} = ?`
            values.push(value)
            return await database.Query(SQL, values)
        }
        throw new Error("Call update only if the result is from where or execute class!")
    }

    async insert(){
        let auto = this.__auto__field
        let database = ConnectionWrapper.GetConnectionByClassName(this.tableName)
        if(!database){
            throw new Error("There is no database connected to this table. did you push the table to database with await?")
        }
        let updated = this.toSQLValues(this.__updated__)
        let SQL = `INSERT INTO ${this.tableName}(`
        let VAL = "VALUES("
        let update = this.toSQLValues(this.__updated__)
        let values = []
        for(const key in updated){
            if(key == auto) continue;
            SQL += `${key}, `
            VAL += "?, "
            values.push(update[key])
        }
        SQL = SQL.substring(0, SQL.length - 2)+ ") "
        VAL = VAL.substring(0, VAL.length - 2) + ");"
        SQL += VAL
        return await database.Query(SQL, values)
    }

    async delete(){
        let auto = this.__auto__field
        let value = this[this.__auto__field]
        let database = ConnectionWrapper.GetConnectionByClassName(this.tableName)
        if(!database){
            throw new Error("There is no database connected to this table. did you push the table to database with await?")
        }
        if(value instanceof MySQLField){
            throw new Error("Call delete only if the result is from where or execute class!")
        }
        return await database.SingleQuery(`DELETE FROM ${this.tableName} WHERE ${auto} = ${value}`)
    }

    toSQLValues(res){
        let result = {}
        for(const key in res){
            switch(typeof res[key]){
                case "object":
                    result[key] = JSON.stringify(res[key])
                    break
                case "boolean":
                    result[key] = res[key].toString()
                    break
                default:
                    result[key] = res[key]
                    break 
            }
        }
        return result
    }
}