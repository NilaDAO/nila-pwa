import { openDB,deleteDB } from 'idb';

const DB_NAME = 'APPDB';

const initDB = async () => {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('Init', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('FarmData', { keyPath: 'id', autoIncrement: true });
      }
      if (oldVersion < 2) {
        db.createObjectStore('ActiveLoans', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('Contacts', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
};

export const createItem = async (item,STORE) => {
  const db = await initDB();
  return db.add(STORE, item);
};

export const readItem = async (id,STORE) => {
  const db = await initDB();
  return db.get(STORE, id);
};

export const readAllItems = async (STORE) => {
  const db = await initDB();
  const items = await db.getAll(STORE);

  // Convert the array of objects into an object with id as the key
  const itemsObject = items.reduce((acc, item) => {
    acc[item.id] = item.value; // Assuming each item has 'id' and 'value' properties
    return acc;
  }, {});

  return itemsObject; // Return the object
};

export const updateItem = async (item,STORE) => {
  const db = await initDB();
  return db.put(STORE, item);
};

export const deleteItem = async (id,STORE) => {
  const db = await initDB();
  return db.delete(STORE, id);
}

export const deleteAllItems = async () => {
  console.log('delete DB')
  return deleteDB(DB_NAME);
}

// A tiny helper to read, create or update a db
export const setDBitem = async (_id,_value,store) => {
  const db = await initDB();
  // use put to avoid ConstraintError when concurrent calls race to add the same key
  return db.put(store,{ id: _id, value: _value });
}
