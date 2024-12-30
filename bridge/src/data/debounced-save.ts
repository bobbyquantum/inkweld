import debounce from 'lodash.debounce';

import { getProsemirrorContent } from '../persistence';
import { pool } from './pool';
import { WSSharedDoc } from './ws-shared-doc';

export const CALLBACK_DEBOUNCE_WAIT = parseInt(
  process.env.CALLBACK_DEBOUNCE_WAIT || '2000'
);
export const CALLBACK_DEBOUNCE_MAXWAIT = parseInt(
  process.env.CALLBACK_DEBOUNCE_MAXWAIT || '10000'
);

export const debouncedSave = debounce(
  (doc: WSSharedDoc) => {
    try {
      pool.connect((err, client, done) => {
        if (!client) {
          console.error('Error connecting to the database:', err);
          return;
        }
        const { content, error } = getProsemirrorContent(doc);
        if (error) {
          console.error(
            `Error getting ProseMirror content for ${doc.name}:`,
            error
          );
        }
        // now find the project_element with the correct id (doc.name)
        client.query(
          'SELECT * FROM project_elements WHERE id = $1',
          [doc.name],
          (err, res) => {
            done();
            if (err) {
              console.error('Error fetching project_element:', err);
            } else {
              if (res.rows.length === 0) {
                console.error("Document doesn't exist in the database.");
              } else {
                // If the project_element exists, update it
                client.query(
                  'UPDATE project_elements SET content = $2 WHERE id = $1',
                  [doc.name, content],
                  (err, _res) => {
                    if (err) {
                      console.error('Error updating project_element:', err);
                    } else {
                      console.log(`Document ${doc.name} saved successfully.`);
                    }
                  }
                );
              }
            }
          }
        );
      });
      console.log(`Document ${doc.name} saved successfully.`);
    } catch (error) {
      console.error(`Error saving document ${doc.name}:`, error);
    }
  },
  CALLBACK_DEBOUNCE_WAIT,
  { maxWait: CALLBACK_DEBOUNCE_MAXWAIT }
);
