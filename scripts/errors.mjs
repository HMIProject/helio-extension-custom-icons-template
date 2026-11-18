/**
 * Error caused by invalid input or state the user can fix (bad name, missing
 * file, name clash, ...). The message is meant to be shown as is. `status` is
 * the matching HTTP status, used by the web interface (ui/server.mjs); the
 * command line scripts just print the message.
 */
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
