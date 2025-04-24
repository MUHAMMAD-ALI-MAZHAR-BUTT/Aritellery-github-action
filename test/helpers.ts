
export const toSupabaseResponse = (data: any, error: any = null) => {
    const count = Array.isArray(data) ? data.length : 1;
    return { data, error, count, status: 200, statusText: 'OK' };
};
