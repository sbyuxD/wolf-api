const CREATOR = "sbyuxD";

export const sendSuccess = (res, result = null, statusCode = 200) => {
  return res.status(statusCode).json({
    status: true,
    creator: CREATOR,
    result
  });
};

export const sendError = (res, message = "Internal Server Error", statusCode = 500) => {
  return res.status(statusCode).json({
    status: false,
    creator: CREATOR,
    message
  });
};